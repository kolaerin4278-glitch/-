import './styles/main.css';
import { telegram } from './telegram';
import { storage } from './storage';
import { getTodayKey, formatDate, fromDateKey } from './date';
import { escapeHtml } from './utils';
import { SPHERES, STATUS, MILESTONES, type Sphere, type Status } from './constants';
import { computeStreak } from './streak';
import { modalManager } from './ui/modal';
import { SwipeManager, type SwipeDirection } from './ui/gestures';
import { getHabitFormHTML } from './components/HabitForm';
import { getAnalyticsHTML } from './components/AnalyticsView';
import { getMasteryHTML } from './components/MasteryView';
import { getRitualsHTML, formatDuration, type ActiveRitualSession } from './components/RitualsView';
import { getSettingsHTML } from './components/SettingsView';

class App {
  private currentTab = 'today';
  private activeSphere: 'all' | Sphere = 'all';
  private islandTimer: ReturnType<typeof setTimeout> | null = null;
  private ritualSession: ActiveRitualSession | null = null;
  private ritualRafId: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.updateHeaderDate();
    storage.subscribe(() => { this.render(); });
    this.setupNavigation();
    this.setupAddHabitButton();
    this.setupSwipeManager();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateHeaderDate();
        this.syncRitualTimerOnResume();
      }
    });

    this.render();
  }

  private updateHeaderDate(): void {
    const dateLabel = document.getElementById('headerDateLabel');
    if (!dateLabel) return;
    const { dayBoundaryHour } = storage.getState().settings;
    const today = fromDateKey(getTodayKey(dayBoundaryHour));
    dateLabel.textContent = formatDate(today);
  }

  private setupNavigation(): void {
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    const navPill = document.querySelector('.nav-slider-pill') as HTMLElement | null;

    const updatePill = (btn: HTMLElement): void => {
      if (!navPill || !btn.parentElement) return;
      const rect = btn.getBoundingClientRect();
      const parentRect = btn.parentElement.getBoundingClientRect();
      const left = rect.left - parentRect.left;
      navPill.style.width = `${rect.width}px`;
      navPill.style.height = `${rect.height}px`;
      navPill.style.transform = `translateX(${left}px)`;
    };

    navButtons.forEach((btn) => {
      const button = btn as HTMLElement;
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (!tab) return;
        telegram.haptic('light');
        this.switchTab(tab);
        navButtons.forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
        updatePill(button);
      });
    });

    const activeBtn = document.querySelector('.nav-tab-btn.active') as HTMLElement | null;
    if (activeBtn) {
      requestAnimationFrame(() => updatePill(activeBtn));
    }
  }

  private switchTab(tab: string): void {
    this.currentTab = tab;
    const heading = document.getElementById('pageHeading');
    if (heading) {
      const titles: Record<string, string> = {
        today: 'Сегодня',
        rituals: 'Ритуалы',
        analytics: 'Анализ',
        mastery: 'Мастерство',
        settings: 'Опции'
      };
      heading.textContent = titles[tab] ?? 'Дневник привычек';
    }
    this.render();
  }

  private setupAddHabitButton(): void {
    const btn = document.getElementById('addHabitBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      telegram.haptic('medium');
      this.openHabitModal();
    });
  }

  private setupSwipeManager(): void {
    const container = document.getElementById('carouselPages');
    if (!container) return;
    new SwipeManager(container, (habitId: string, direction: SwipeDirection) => {
      if (this.currentTab !== 'today') return;
      if (direction === 'right-long') {
        this.recordHabitStatus(habitId, STATUS.FULL);
      } else if (direction === 'right-short') {
        this.recordHabitStatus(habitId, STATUS.PLAN_B);
      } else {
        this.recordHabitStatus(habitId, STATUS.SKIP);
      }
    });
  }

  private openHabitModal(habitId?: string): void {
    modalManager.open(getHabitFormHTML(habitId), (container) => {
      const form = container.querySelector('#habitForm') as HTMLFormElement | null;
      const deleteBtn = container.querySelector('#deleteHabitBtn') as HTMLButtonElement | null;

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const title = String(formData.get('title') ?? '').trim();
        if (!title) return;

        const icon = String(formData.get('icon') ?? '✨').trim() || '✨';
        const sphere = String(formData.get('sphere') ?? SPHERES.WORK) as Sphere;
        const trigger = String(formData.get('trigger') ?? '').trim();
        const norm = String(formData.get('norm') ?? 'Выполнено').trim() || 'Выполнено';
        const planB = String(formData.get('planB') ?? 'Минимум').trim() || 'Минимум';
        const capsule = String(formData.get('capsule') ?? '').trim();

        if (habitId) {
          storage.updateHabit(habitId, { title, icon, sphere, trigger, norm, planB, capsule });
          this.showIsland('Привычка обновлена ✓');
        } else {
          storage.addHabit({
            title,
            icon,
            sphere,
            type: 'binary',
            trigger,
            norm,
            planB,
            keystone: false,
            incognito: false,
            capsule
          });
          this.showIsland('Привычка добавлена ✨');
        }

        telegram.haptic('medium');
        modalManager.close();
      });

      deleteBtn?.addEventListener('click', () => {
        if (!habitId) return;
        storage.deleteHabit(habitId);
        telegram.haptic('heavy');
        modalManager.close();
        this.showIsland('Привычка удалена');
      });
    });
  }

  private recordHabitStatus(habitId: string, status: Status): void {
    const state = storage.getState();
    const todayKey = getTodayKey(state.settings.dayBoundaryHour);
    telegram.haptic('medium');
    storage.setCheck(habitId, todayKey, {
      status,
      ts: Date.now()
    });

    if (status === STATUS.FULL || status === STATUS.PLAN_B) {
      const habit = storage.getHabits().find((h) => h.id === habitId);
      if (habit) {
        const nextState = storage.getState();
        const streak = computeStreak(habit, nextState.checks, nextState.logs, todayKey);
        if ((MILESTONES as readonly number[]).includes(streak)) {
          this.showIsland(`Серия ${streak} дн. — новый рубеж! 🎉`);
          return;
        }
      }
      this.showIsland(status === STATUS.PLAN_B ? 'Закрыто Планом Б 🟡' : 'Норма выполнена ✓');
    } else {
      this.showIsland('Пропуск отмечен • Не пропускай дважды');
    }
  }

  private render(): void {
    const container = document.getElementById('carouselPages');
    if (!container) return;
    if (this.currentTab === 'today') {
      this.renderTodayPage(container);
    } else if (this.currentTab === 'rituals') {
      container.innerHTML = `<div class="page">${getRitualsHTML(this.ritualSession)}</div>`;
      this.setupRitualsHandlers();
    } else if (this.currentTab === 'analytics') {
      container.innerHTML = `<div class="page">${getAnalyticsHTML()}</div>`;
    } else if (this.currentTab === 'mastery') {
      container.innerHTML = `<div class="page">${getMasteryHTML()}</div>`;
    } else if (this.currentTab === 'settings') {
      container.innerHTML = `<div class="page">${getSettingsHTML()}</div>`;
      this.setupSettingsHandlers();
    }
  }

  private renderTodayPage(container: HTMLElement): void {
    const state = storage.getState();
    const habits = storage.getHabits();
    const todayKey = getTodayKey(state.settings.dayBoundaryHour);
    const dayLog = storage.getDayLog(todayKey);
    const currentEnergy = dayLog?.energy ?? 0;

    let doneToday = 0;
    habits.forEach((h) => {
      const c = storage.getCheck(h.id, todayKey);
      if (c?.status === STATUS.FULL || c?.status === STATUS.PLAN_B) doneToday++;
    });
    const campfirePct = habits.length > 0 ? Math.round((doneToday / habits.length) * 100) : 0;

    const toolbarHTML = `
      <div class="today-toolbar">
        <div class="campfire-bar">
          <div class="campfire-title">🔥 Костёр дня (${doneToday}/${habits.length})</div>
          <div class="campfire-pct">${campfirePct}%</div>
        </div>
        <div class="energy-card">
          <div class="energy-header">
            <span>Энергия сегодня</span>
            <span>${currentEnergy > 0 && currentEnergy <= 2 ? 'Низкий заряд → жми План Б' : '1–5'}</span>
          </div>
          <div class="energy-tabs" role="radiogroup" aria-label="Уровень энергии">
            ${[1, 2, 3, 4, 5]
              .map(
                (lvl) => `
                  <button type="button" class="energy-level-tab ${currentEnergy === lvl ? 'active' : ''}" data-energy="${lvl}" role="radio" aria-checked="${currentEnergy === lvl}">
                    ${lvl}
                  </button>
                `
              )
              .join('')}
          </div>
        </div>
        <div class="filter-bar" role="group" aria-label="Фильтр по сферам">
          ${[
            { id: 'all', label: 'Все' },
            { id: SPHERES.BODY, label: SPHERES.BODY },
            { id: SPHERES.MIND, label: SPHERES.MIND },
            { id: SPHERES.WORK, label: SPHERES.WORK },
            { id: SPHERES.SPIRIT, label: SPHERES.SPIRIT }
          ]
            .map(
              (f) => `
                <button type="button" class="filter-pill ${this.activeSphere === f.id ? 'active' : ''}" data-sphere="${escapeHtml(f.id)}">
                  ${escapeHtml(f.label)}
                </button>
              `
            )
            .join('')}
        </div>
      </div>
    `;

    const visibleHabits = this.activeSphere === 'all' ? habits : habits.filter((h) => h.sphere === this.activeSphere);

    if (visibleHabits.length === 0) {
      container.innerHTML = `<div class="page">${toolbarHTML}<div class="empty-state"><div class="empty-state-icon">🌱</div><div class="empty-state-text">${habits.length === 0 ? 'Добавь привычки' : 'В этой сфере пусто'}</div></div></div>`;
      this.setupTodayToolbarHandlers();
      return;
    }

    const habitCards = visibleHabits
      .map((habit) => {
        const check = storage.getCheck(habit.id, todayKey);
        const streak = computeStreak(habit, state.checks, state.logs, todayKey);
        const isDone = check?.status === STATUS.FULL || check?.status === STATUS.PLAN_B;
        const isSkipped = check?.status === STATUS.SKIP;

        return `
          <div class="habit-card" data-habit-id="${escapeHtml(habit.id)}">
            <div class="habit-card-header">
              <div class="habit-icon" aria-hidden="true">${escapeHtml(habit.icon)}</div>
              <div class="habit-info">
                <div class="habit-title-row">
                  <div class="habit-title">${escapeHtml(habit.title)}</div>
                  <span class="habit-sphere-tag">${escapeHtml(habit.sphere)}</span>
                </div>
                ${habit.trigger ? `<div class="habit-trigger">${escapeHtml(habit.trigger)}</div>` : ''}
                ${streak > 0 ? `<div class="habit-trigger">🔥 Серия: ${streak} дн.</div>` : ''}
              </div>
              <button type="button" class="habit-edit-btn" data-edit-habit="${escapeHtml(habit.id)}" aria-label="Редактировать">✎</button>
            </div>
            ${
              isDone || isSkipped
                ? `
              <div class="habit-completed">
                ${check?.status === STATUS.FULL ? '<span class="streak-badge">✓ Норма</span>' : check?.status === STATUS.PLAN_B ? '<span class="plan-b-pill">🟡 План Б</span>' : '<span class="skip-pill">✕ Пропуск</span>'}
                <button type="button" class="undo-inline-btn" data-undo-habit="${escapeHtml(habit.id)}">Отменить</button>
              </div>
            `
                : `
              <div class="habit-actions">
                <button type="button" class="habit-action-btn ${currentEnergy > 0 && currentEnergy <= 2 ? 'amber' : ''}" data-action="planb">
                  ${escapeHtml(habit.planB || 'План Б')}
                </button>
                <button type="button" class="habit-action-btn primary" data-action="full">
                  ${escapeHtml(habit.norm || 'Норма')}
                </button>
                <button type="button" class="habit-action-btn danger" data-action="skip">
                  Пропуск
                </button>
              </div>
            `
            }
          </div>
        `;
      })
      .join('');

    container.innerHTML = `<div class="page">${toolbarHTML}${habitCards}</div>`;
    this.setupTodayToolbarHandlers();
    this.setupHabitActions();
  }

  private setupTodayToolbarHandlers(): void {
    document.querySelectorAll('.energy-level-tab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const lvl = Number((e.currentTarget as HTMLElement).dataset.energy ?? 0);
        const state = storage.getState();
        const todayKey = getTodayKey(state.settings.dayBoundaryHour);
        telegram.haptic('light');
        storage.setDayLog(todayKey, { date: todayKey, energy: lvl, shielded: storage.getDayLog(todayKey)?.shielded ?? false });
      });
    });

    document.querySelectorAll('.filter-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const sphere = (e.currentTarget as HTMLElement).dataset.sphere as 'all' | Sphere;
        telegram.haptic('light');
        this.activeSphere = sphere;
        this.render();
      });
    });
  }

  private setupHabitActions(): void {
    document.querySelectorAll('.habit-action-btn[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const button = e.currentTarget as HTMLElement;
        const card = button.closest('.habit-card') as HTMLElement | null;
        if (!card) return;
        const habitId = card.dataset.habitId;
        const action = button.dataset.action;
        if (!habitId || !action) return;
        const status = action === 'full' ? STATUS.FULL : action === 'planb' ? STATUS.PLAN_B : STATUS.SKIP;
        this.recordHabitStatus(habitId, status);
      });
    });
    document.querySelectorAll('[data-undo-habit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const habitId = (e.currentTarget as HTMLElement).dataset.undoHabit;
        if (!habitId) return;
        storage.clearCheck(habitId, getTodayKey(storage.getState().settings.dayBoundaryHour));
        this.showIsland('Отметка снята');
      });
    });
    document.querySelectorAll('[data-edit-habit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const habitId = (e.currentTarget as HTMLElement).dataset.editHabit;
        if (!habitId) return;
        this.openHabitModal(habitId);
      });
    });
  }

  private setupRitualsHandlers(): void {
    document.getElementById('addDefaultRitualBtn')?.addEventListener('click', () => {
      storage.addRitual({
        title: 'Утренний старт',
        icon: '☀️',
        steps: [
          { title: 'Стакан воды', minutes: 2, order: 0 },
          { title: 'Разминка', minutes: 5, order: 1 },
          { title: 'План на день', minutes: 3, order: 2 }
        ]
      });
      this.showIsland('Ритуал добавлен ✓');
    });

    document.getElementById('createRitualBtn')?.addEventListener('click', () => {
      modalManager.open(
        `<form id="ritualForm" class="habit-form"><h3 class="modal-title">Новый ритуал</h3><label class="form-field"><span>Название</span><input type="text" name="title" maxlength="80" placeholder="Вечернее восстановление" required></label><label class="form-field"><span>Шаг 1</span><input type="text" name="step1" maxlength="80" placeholder="Убрать телефон" required></label><label class="form-field"><span>Длительность (мин)</span><input type="number" name="min1" min="1" max="120" value="5" required></label><button type="submit" class="habit-action-btn primary">Создать</button></form>`,
        (container) => {
          container.querySelector('#ritualForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            storage.addRitual({
              title: String(fd.get('title')),
              icon: '🔗',
              steps: [{ title: String(fd.get('step1')), minutes: Number(fd.get('min1')), order: 0 }]
            });
            modalManager.close();
            this.showIsland('Ритуал создан');
          });
        }
      );
    });

    document.querySelectorAll('[data-start-ritual]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.startRitual;
        const ritual = storage.getRituals().find((r) => r.id === id);
        if (!ritual || !ritual.steps[0]) return;
        this.ritualSession = { ritual, stepIndex: 0, stepEndTimestamp: Date.now() + ritual.steps[0].minutes * 60_000, pausedRemainingMs: null };
        this.render();
        this.startRitualLoop();
      });
    });

    document.querySelectorAll('[data-ritual-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.ritualAction;
        if (!this.ritualSession || !action) return;
        if (action === 'stop') {
          this.stopRitualSession();
        } else if (action === 'next-step') {
          this.advanceRitualStep();
        }
        this.render();
      });
    });
  }

  private startRitualLoop(): void {
    this.stopRitualLoop();
    const tick = (): void => {
      if (!this.ritualSession || this.ritualSession.pausedRemainingMs !== null) return;
      const remaining = this.ritualSession.stepEndTimestamp - Date.now();
      if (remaining <= 0) {
        this.advanceRitualStep();
        return;
      }
      const digits = document.getElementById('ritualTimerDigits');
      if (digits) digits.textContent = formatDuration(remaining);
      this.ritualRafId = requestAnimationFrame(tick);
    };
    this.ritualRafId = requestAnimationFrame(tick);
  }

  private stopRitualLoop(): void {
    if (this.ritualRafId !== null) cancelAnimationFrame(this.ritualRafId);
    this.ritualRafId = null;
  }

  private advanceRitualStep(): void {
    if (!this.ritualSession) return;
    const nextIdx = this.ritualSession.stepIndex + 1;
    const nextStep = this.ritualSession.ritual.steps[nextIdx];
    if (!nextStep) {
      this.stopRitualSession();
      this.showIsland('Ритуал завершён! 🎉');
      this.render();
      return;
    }
    this.ritualSession.stepIndex = nextIdx;
    this.ritualSession.stepEndTimestamp = Date.now() + nextStep.minutes * 60_000;
    this.render();
    this.startRitualLoop();
  }

  private stopRitualSession(): void {
    this.stopRitualLoop();
    this.ritualSession = null;
  }

  private syncRitualTimerOnResume(): void {
    if (!this.ritualSession || this.ritualSession.pausedRemainingMs !== null) return;
    while (this.ritualSession && this.ritualSession.stepEndTimestamp <= Date.now()) {
      const nextIdx = this.ritualSession.stepIndex + 1;
      const nextStep = this.ritualSession.ritual.steps[nextIdx];
      if (!nextStep) {
        this.stopRitualSession();
        this.showIsland('Ритуал завершён! 🎉');
        this.render();
        return;
      }
      const overflow = Date.now() - this.ritualSession.stepEndTimestamp;
      this.ritualSession.stepIndex = nextIdx;
      this.ritualSession.stepEndTimestamp = Date.now() + Math.max(0, nextStep.minutes * 60_000 - overflow);
    }
    if (this.currentTab === 'rituals') {
      this.render();
      this.startRitualLoop();
    }
  }

  private setupSettingsHandlers(): void {
    document.getElementById('dayBoundarySelect')?.addEventListener('change', (e) => {
      storage.updateSettings({ dayBoundaryHour: Number((e.target as HTMLSelectElement).value) });
      this.updateHeaderDate();
    });

    document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([storage.exportJSON()], { type: 'application/json' }));
      a.download = `habit-diary.json`;
      a.click();
    });

    document.getElementById('resetDataBtn')?.addEventListener('click', () => {
      if (confirm('Сбросить всё?')) {
        storage.clearAll();
        this.render();
      }
    });
  }

  private showIsland(message: string): void {
    const island = document.getElementById('dynamicIsland');
    if (!island) return;
    if (this.islandTimer) clearTimeout(this.islandTimer);
    island.textContent = message;
    island.classList.add('show');
    this.islandTimer = setTimeout(() => island.classList.remove('show'), 2500);
  }
}

document.addEventListener('DOMContentLoaded', () => { new App(); });
