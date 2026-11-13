import { storage } from '../storage';
import { escapeHtml } from '../utils';

export function getMasteryHTML(): string {
  const state = storage.getState();
  const habits = storage.getHabits();

  if (habits.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🏆</div>
        <div class="empty-state-text">Привычки, достигшие 60 дней подряд, попадут на твою Полку мастерства</div>
      </div>
    `;
  }

  const targetDays = 60;

  const cards = habits
    .map((habit) => {
      let completedDays = 0;
      state.checks.forEach((check) => {
        if (check.habitId === habit.id && (check.status === 'full' || check.status === 'plan_b')) {
          completedDays++;
        }
      });

      const pct = Math.min(100, Math.round((completedDays / targetDays) * 100));
      const isMastered = completedDays >= targetDays;

      return `
        <div class="section-card">
          <div class="habit-card-header">
            <div class="habit-icon" aria-hidden="true">${escapeHtml(habit.icon)}</div>
            <div class="habit-info">
              <div class="habit-title">${escapeHtml(habit.title)}</div>
              <div class="habit-trigger">${completedDays} из ${targetDays} дней ${isMastered ? '• Освоено 🏆' : ''}</div>
            </div>
          </div>
          <div class="mastery-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="mastery-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="mastery-view">${cards}</div>`;
}
