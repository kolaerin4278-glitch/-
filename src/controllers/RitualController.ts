import { storage } from '../storage';
import { modalManager } from '../ui/modal';
import { islandManager } from '../ui/island';
import { telegram } from '../telegram';
import { escapeHtml } from '../utils';
import type { CreateRitualInput } from '../core/factory';
import type { Ritual } from '../core/types';
import { getRitualsHTML, type ActiveRitualSession } from '../components/RitualsView';

/**
 * Контроллер ритуалов: создание, запуск, таймер шага, пауза, удаление.
 *
 * Таймер не сбивается при блокировке экрана, потому что отсчёт идёт
 * от абсолютного `stepEndTimestamp`, а не от счётчика тиков.
 */
export class RitualController {
  private session: ActiveRitualSession | null = null;
  private ticker: number | null = null;
  private readonly onUpdate: () => void;

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate;
  }

  /** Текущая активная сессия (для рендера). */
  getSession(): ActiveRitualSession | null {
    return this.session;
  }

  /** Разметка раздела ритуалов. */
  render(): string {
    return getRitualsHTML(this.session);
  }

  /** Привязывает обработчики к DOM-контейнеру раздела. */
  bind(container: HTMLElement, signal: AbortSignal): void {
    container.querySelectorAll<HTMLElement>('[data-start-ritual]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const ritualId = btn.dataset['startRitual'];
          if (ritualId) this.start(ritualId);
        },
        { signal }
      );
    });

    container.querySelectorAll<HTMLElement>('[data-delete-ritual]').forEach((btn) => {
      btn.addEventListener(
        'click',
        async () => {
          const ritualId = btn.dataset['deleteRitual'];
          if (!ritualId) return;
          const confirmed = await modalManager.confirm({
            title: 'Удалить ритуал?',
            message: 'Ритуал и его таймер будут удалены.',
            confirmLabel: 'Удалить',
            danger: true
          });
          if (confirmed) {
            storage.deleteRitual(ritualId);
            islandManager.show({ message: 'Ритуал удалён', icon: '🗑️' });
            this.onUpdate();
          }
        },
        { signal }
      );
    });

    container.querySelector('#createRitualBtn')?.addEventListener(
      'click',
      () => this.openCreateModal(),
      { signal }
    );

    container.querySelector('#addDefaultRitualBtn')?.addEventListener(
      'click',
      () => this.openCreateModal(true),
      { signal }
    );

    container.querySelectorAll<HTMLElement>('[data-ritual-action]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const action = btn.dataset['ritualAction'];
          if (action === 'toggle-pause') this.togglePause();
          else if (action === 'next-step') this.nextStep();
          else if (action === 'stop') this.stop();
        },
        { signal }
      );
    });

    this.startTicker();
  }

  /**
   * Запуск ритуала: начинается первый шаг.
   */
  start(ritualId: string): void {
    const ritual = storage.getRituals().find((r) => r.id === ritualId);
    if (!ritual || ritual.steps.length === 0) return;

    const firstStep = ritual.steps[0]!;
    this.session = {
      ritual,
      stepIndex: 0,
      stepEndTimestamp: Date.now() + firstStep.minutes * 60_000,
      pausedRemainingMs: null
    };

    telegram.haptic('medium');
    islandManager.show({ message: `Ритуал «${ritual.title}» запущен`, icon: ritual.icon ?? '🔗' });
    this.onUpdate();
  }

  /**
   * Пауза / возобновление текущего шага.
   */
  togglePause(): void {
    if (!this.session) return;
    if (this.session.pausedRemainingMs !== null) {
      // Возобновление
      this.session.stepEndTimestamp = Date.now() + this.session.pausedRemainingMs;
      this.session.pausedRemainingMs = null;
      islandManager.show({ message: 'Продолжаем', icon: '▶️' });
    } else {
      // Пауза: фиксируем остаток
      this.session.pausedRemainingMs = Math.max(0, this.session.stepEndTimestamp - Date.now());
      islandManager.show({ message: 'Пауза', icon: '⏸️' });
    }
    this.onUpdate();
  }

  /**
   * Переход к следующему шагу ритуала.
   */
  nextStep(): void {
    if (!this.session) return;
    const nextIndex = this.session.stepIndex + 1;

    if (nextIndex >= this.session.ritual.steps.length) {
      this.complete();
      return;
    }

    const nextStep = this.session.ritual.steps[nextIndex]!;
    this.session = {
      ...this.session,
      stepIndex: nextIndex,
      stepEndTimestamp: Date.now() + nextStep.minutes * 60_000,
      pausedRemainingMs: null
    };

    telegram.haptic('light');
    islandManager.show({
      message: `Шаг ${nextIndex + 1}: ${nextStep.title}`,
      icon: '⏭️'
    });
    this.onUpdate();
  }

  /**
   * Остановка ритуала.
   */
  stop(): void {
    this.session = null;
    this.stopTicker();
    islandManager.show({ message: 'Ритуал остановлен', icon: '⏹️' });
    this.onUpdate();
  }

  private complete(): void {
    const title = this.session?.ritual.title ?? '';
    this.session = null;
    this.stopTicker();
    telegram.hapticNotification('success');
    islandManager.show({ message: `Ритуал «${title}» завершён`, icon: '🏆' });
    this.onUpdate();
  }

  /**
   * Тикер обновляет цифры таймера раз в секунду.
   */
  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = window.setInterval(() => {
      if (!this.session) return;
      const digits = document.querySelector<HTMLElement>('#ritualTimerDigits');
      if (!digits) return;

      if (this.session.pausedRemainingMs !== null) {
        digits.textContent = formatRemain(this.session.pausedRemainingMs);
        return;
      }

      const remaining = this.session.stepEndTimestamp - Date.now();
      digits.textContent = formatRemain(remaining);

      if (remaining <= 0) {
        this.nextStep();
      }
    }, 1000);
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /**
   * Модальное окно создания ритуала.
   */
  private openCreateModal(withDefault = false): void {
    const defaultSteps = withDefault
      ? [
          { title: 'Стакан воды', minutes: 2 },
          { title: 'Утренняя растяжка', minutes: 5 },
          { title: 'Дневник намерения', minutes: 3 }
        ]
      : [{ title: '', minutes: 5 }];

    const html = `
      <form id="ritualForm" class="habit-form" novalidate>
        <h3 class="modal-title">Новый ритуал</h3>

        <div class="form-field">
          <label for="ritualTitleInput">Название ритуала *</label>
          <input type="text" id="ritualTitleInput" maxlength="100" placeholder="Утренний старт" required>
        </div>

        <div class="form-field">
          <label for="ritualIconInput">Иконка</label>
          <input type="text" id="ritualIconInput" maxlength="4" placeholder="🔗" value="🔗">
        </div>

        <div id="ritualStepsBox">
          ${defaultSteps.map((s) => renderStepRow(s.title, s.minutes)).join('')}
        </div>

        <button type="button" id="addRitualStepBtn" class="habit-action-btn">+ Добавить шаг</button>

        <div class="form-actions">
          <button type="button" id="ritualCancelBtn" class="habit-action-btn">Отмена</button>
          <button type="submit" id="ritualSaveBtn" class="habit-action-btn primary">Создать</button>
        </div>
      </form>
    `;

    modalManager.open(
      html,
      (container, signal) => {
        const titleInput = container.querySelector<HTMLInputElement>('#ritualTitleInput');
        const iconInput = container.querySelector<HTMLInputElement>('#ritualIconInput');
        const stepsBox = container.querySelector<HTMLElement>('#ritualStepsBox');

        container.querySelector('#addRitualStepBtn')?.addEventListener(
          'click',
          () => {
            stepsBox?.insertAdjacentHTML('beforeend', renderStepRow('', 5));
          },
          { signal }
        );

        container.querySelector('#ritualCancelBtn')?.addEventListener(
          'click',
          () => modalManager.close(),
          { signal }
        );

        container.querySelector('#ritualForm')?.addEventListener(
          'submit',
          (e) => {
            e.preventDefault();
            const title = titleInput?.value.trim() ?? '';
            if (!title) {
              telegram.hapticNotification('error');
              titleInput?.focus();
              return;
            }

            const steps = Array.from(
              container.querySelectorAll<HTMLElement>('.ritual-step-row')
            ).map((row) => {
              const t = row.querySelector<HTMLInputElement>('[data-step-title]')?.value.trim() ?? '';
              const m = parseInt(row.querySelector<HTMLInputElement>('[data-step-minutes]')?.value ?? '5', 10);
              return { title: t, minutes: isNaN(m) ? 5 : m };
            }).filter((s) => s.title.length > 0);

            if (steps.length === 0) {
              telegram.hapticNotification('error');
              islandManager.show({ message: 'Добавь хотя бы один шаг', icon: '⚠️' });
              return;
            }

            const input: CreateRitualInput = {
              title,
              icon: iconInput?.value.trim() || '🔗',
              steps
            };

            try {
              storage.addRitual(input);
              modalManager.close();
              telegram.hapticNotification('success');
              islandManager.show({ message: 'Ритуал создан', icon: '🔗' });
              this.onUpdate();
            } catch (err) {
              islandManager.show({
                message: err instanceof Error ? err.message : 'Не удалось создать ритуал',
                icon: '⚠️'
              });
            }
          },
          { signal }
        );
      }
    );
  }
}

function renderStepRow(title: string, minutes: number): string {
  return `
    <div class="form-row ritual-step-row">
      <div class="form-field">
        <label for="ritualStepTitle">Шаг</label>
        <input type="text" data-step-title maxlength="100" placeholder="Стакан воды" value="${escapeHtml(title)}">
      </div>
      <div class="form-field" style="max-width:110px;">
        <label for="ritualStepMinutes">Минут</label>
        <input type="number" data-step-minutes min="1" max="240" step="1" value="${minutes}">
      </div>
    </div>
  `;
}

function formatRemain(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export type { Ritual };
