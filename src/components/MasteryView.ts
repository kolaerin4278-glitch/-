import { storage } from '../storage';
import { escapeHtml } from '../utils';
import { computeLongestStreak } from '../streak';

/**
 * Полка мастерства: привычка считается освоенной, когда она держит серию
 * не меньше собственной цели (30 / 60 / 90 дней подряд), а не просто
 * набрала нужное количество отметок за всю историю (План 06, п. 0530).
 */
export function getMasteryHTML(): string {
  const state = storage.getState();
  const habits = storage.getHabits();
  const todayKey = storage.getSelectedDateKey();

  if (habits.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🏆</div>
        <div class="empty-state-text">Привычки, достигшие 60 дней подряд, попадут на твою Полку мастерства</div>
      </div>
    `;
  }

  const cards = habits
    .map((habit) => {
      const targetDays = habit.masteryTargetDays ?? 60;
      const best = computeLongestStreak(habit, state.checks, state.logs, todayKey, 365, state.settings.vacationUntil);

      // Текущая серия и общий счётчик дней — считаем отдельно,
      // чтобы прогресс отражал именно непрерывность, а не сумму дней.
      let completedDays = 0;
      state.checks.forEach((check) => {
        if (check.habitId === habit.id && (check.status === 'full' || check.status === 'plan_b')) {
          completedDays++;
        }
      });

      const pct = Math.min(100, Math.round((best / targetDays) * 100));
      const isMastered = best >= targetDays;

      return `
        <div class="section-card ${isMastered ? 'mastery-mastered' : ''}">
          <div class="habit-card-header">
            <div class="habit-icon" aria-hidden="true">${escapeHtml(habit.icon)}</div>
            <div class="habit-info">
              <div class="habit-title">${escapeHtml(habit.title)}</div>
              <div class="habit-trigger">Лучшая серия ${best} из ${targetDays} дн. подряд ${isMastered ? '• Освоено 🏆' : ''}</div>
              <div class="habit-trigger">Всего отмечено дней: ${completedDays}</div>
            </div>
          </div>
          <div class="mastery-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
               aria-label="Прогресс освоения: ${best} из ${targetDays} дней подряд">
            <div class="mastery-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="mastery-view">${cards}</div>`;
}
