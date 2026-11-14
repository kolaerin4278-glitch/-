import { STATUS } from '../constants';
import { eventBus } from '../core/event-bus';
import { storage } from '../storage';
import { telegram } from '../telegram';
import { islandManager } from '../ui/island';
import { confetti } from '../ui/confetti';
import { computeStreak } from '../streak';
import { getTodayKey } from '../date';

/**
 * Высокоуровневый контроллер действий: выполнение, пропуск, отмена.
 * Реализует паттерн Action-Event-Feedback (План 03, 04, 05).
 */
export class HabitActionController {
  
  static performFull(habitId: string): void {
    const state = storage.getState();
    const today = getTodayKey(state.settings.dayBoundaryHour);
    const prev = storage.getCheck(habitId, today);
    
    storage.setCheck(habitId, today, {
      status: STATUS.FULL,
      ts: Date.now()
    });

    const habit = state.habits.find(h => h.id === habitId);
    if (habit) {
      const streak = computeStreak(habit, state.checks, state.logs, today, state.settings.vacationUntil);
      
      // Feedback: Динамический остров + Конфетти
      islandManager.show({
        message: `Отлично! "${habit.title}" выполнена`,
        icon: '✅',
        undoLabel: 'Отменить',
        onUndo: () => {
          if (prev) storage.setCheck(habitId, today, prev);
          else storage.clearCheck(habitId, today);
        }
      });
      
      telegram.hapticNotification('success');
      
      if (streak > 0 && [7, 14, 30, 60, 100].includes(streak)) {
        confetti.trigger(streak);
        eventBus.emit('habit:milestone', { habit, streak });
      }
    }
  }

  static performPlanB(habitId: string): void {
    const state = storage.getState();
    const today = getTodayKey(state.settings.dayBoundaryHour);
    const prev = storage.getCheck(habitId, today);
    
    storage.setCheck(habitId, today, {
      status: STATUS.PLAN_B,
      ts: Date.now()
    });
    
    telegram.haptic('medium');
    islandManager.show({
      message: 'План Б выполнен. Ритм сохранён!',
      icon: '🛡️',
      undoLabel: 'Отменить',
      onUndo: () => {
        if (prev) storage.setCheck(habitId, today, prev);
        else storage.clearCheck(habitId, today);
      }
    });
  }

  static performSkip(habitId: string, reason: string): void {
    const state = storage.getState();
    const today = getTodayKey(state.settings.dayBoundaryHour);
    const prev = storage.getCheck(habitId, today);
    
    storage.setCheck(habitId, today, {
      status: STATUS.SKIP,
      skipReason: reason,
      ts: Date.now()
    });
    
    telegram.haptic('light');
    islandManager.show({
      message: 'Пропуск записан. Восстановись.',
      icon: '🔄',
      undoLabel: 'Отменить',
      onUndo: () => {
        if (prev) storage.setCheck(habitId, today, prev);
        else storage.clearCheck(habitId, today);
      }
    });
  }
}
