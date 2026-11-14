import { HABIT_TYPES, STATUS } from '../constants';
import { storage } from '../storage';
import { telegram } from '../telegram';
import { islandManager } from '../ui/island';
import { formatTimerRemain } from '../components/HabitProgress';

/**
 * Контроллер счётчиков и таймеров привычек (план 04, п. 0341–0345).
 *
 * Счётчик меняет значение отметки шагом (storage.adjustCounter).
 * Таймер живёт в памяти сессии и отсчитывает от абсолютной отметки времени,
 * поэтому не сбивается при перерисовке ленты.
 */

interface TimerSession {
  readonly habitId: string;
  readonly startedAt: number;
  readonly durationMs: number;
  pausedRemainingMs: number | null;
}

export class ProgressController {
  private static sessions = new Map<string, TimerSession>();
  private static ticker: number | null = null;

  /**
   * Изменяет значение счётчика на шаг.
   */
  static adjustCounter(habitId: string, delta: number): void {
    const dateKey = storage.getSelectedDateKey();
    const habit = storage.getHabits().find((h) => h.id === habitId);
    if (!habit) return;

    const result = storage.adjustCounter(habitId, dateKey, delta);
    telegram.haptic(delta > 0 ? 'light' : 'soft');

    if (!result && delta > 0) {
      islandManager.show({ message: 'Счётчик обнулён', icon: '0️⃣' });
      return;
    }

    const target = habit.targetValue ?? 8;
    if (result && result.status === STATUS.FULL && delta > 0) {
      telegram.hapticNotification('success');
      islandManager.show({
        message: `Цель достигнута: ${habit.title}`,
        icon: '🎯'
      });
    } else if (result && result.status === STATUS.PLAN_B && delta > 0) {
      islandManager.show({
        message: `План Б: ${result.value} из ${target}`,
        icon: '🛡️'
      });
    }
  }

  /**
   * Запуск таймера в один клик (п. 0345).
   */
  static startTimer(habitId: string): void {
    const habit = storage.getHabits().find((h) => h.id === habitId);
    if (!habit) return;

    const existing = ProgressController.sessions.get(habitId);
    if (existing && existing.pausedRemainingMs === null) {
      // Уже идёт — переключаем на паузу
      existing.pausedRemainingMs = Math.max(0, existing.startedAt + existing.durationMs - Date.now());
      ProgressController.syncDisplays();
      telegram.haptic('medium');
      islandManager.show({ message: 'Пауза', icon: '⏸️' });
      return;
    }

    const minutes = Math.max(1, habit.timerMinutes ?? 20);
    const remaining = existing?.pausedRemainingMs ?? minutes * 60_000;

    ProgressController.sessions.set(habitId, {
      habitId,
      startedAt: Date.now() - (minutes * 60_000 - remaining),
      durationMs: minutes * 60_000,
      pausedRemainingMs: null
    });

    ProgressController.startTicker();
    telegram.haptic('medium');
    islandManager.show({ message: `Таймер: ${habit.title}`, icon: '⏱️' });
  }

  /**
   * Остановка таймера с фиксацией выполнения.
   */
  static stopTimer(habitId: string): void {
    const session = ProgressController.sessions.get(habitId);
    if (!session) return;

    const habit = storage.getHabits().find((h) => h.id === habitId);
    const dateKey = storage.getSelectedDateKey();

    if (habit) {
      storage.setCheck(habitId, dateKey, {
        status: STATUS.FULL,
        value: 1,
        ts: Date.now()
      });
      telegram.hapticNotification('success');
      islandManager.show({
        message: `Таймер завершён: ${habit.title}`,
        icon: '✅'
      });
    }

    ProgressController.sessions.delete(habitId);
    ProgressController.syncDisplays();
  }

  /**
   * Привязывает обработчики элементов управления прогрессом.
   */
  static bind(container: HTMLElement, signal: AbortSignal): void {
    container.querySelectorAll<HTMLElement>('[data-counter-step]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const wrapper = btn.closest<HTMLElement>('[data-counter-habit]');
          const habitId = wrapper?.dataset['counterHabit'];
          const step = Number(btn.dataset['counterStep'] ?? '0');
          if (!habitId || !step) return;
          ProgressController.adjustCounter(habitId, step);
        },
        { signal }
      );
    });

    container.querySelectorAll<HTMLElement>('[data-timer-start]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const habitId = btn.dataset['timerStart'];
          if (!habitId) return;
          ProgressController.startTimer(habitId);
        },
        { signal }
      );
    });

    ProgressController.startTicker();
    ProgressController.syncDisplays();
  }

  /**
   * Тикер обновляет цифры таймеров раз в секунду, не вызывая перерисовку ленты.
   */
  private static startTicker(): void {
    if (ProgressController.ticker !== null) return;
    ProgressController.ticker = window.setInterval(() => {
      ProgressController.syncDisplays();
    }, 1000);
  }

  /**
   * Синхронизирует отображаемые цифры с состоянием сессий.
   */
  private static syncDisplays(): void {
    for (const session of ProgressController.sessions.values()) {
      const digits = document.querySelector<HTMLElement>(
        `[data-timer-digits="${session.habitId}"]`
      );
      if (!digits) continue;

      const remaining =
        session.pausedRemainingMs !== null
          ? session.pausedRemainingMs
          : session.startedAt + session.durationMs - Date.now();

      digits.textContent = formatTimerRemain(remaining);

      if (remaining <= 0 && session.pausedRemainingMs === null) {
        ProgressController.stopTimer(session.habitId);
      }
    }
  }
}

/** Типы привычек, поддерживающие прогресс-виджеты. */
export const PROGRESS_TYPES: readonly string[] = [HABIT_TYPES.COUNTER, HABIT_TYPES.TIMER];
