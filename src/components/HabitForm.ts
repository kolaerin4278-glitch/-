import { storage } from '../storage';
import { SPHERES } from '../constants';
import { escapeHtml } from '../utils';

export function getHabitFormHTML(habitId?: string): string {
  const habit = habitId ? storage.getHabits().find(h => h.id === habitId) : undefined;

  return `
    <form id="habitForm" class="habit-form">
      <h3 class="modal-title">${habit ? 'Редактировать привычку' : 'Новая привычка'}</h3>
      <label class="form-field">
        <span>Название</span>
        <input type="text" name="title" maxlength="100" placeholder="Например: Зарядка 15 минут" value="${escapeHtml(habit?.title ?? '')}" required>
      </label>
      <div class="form-row">
        <label class="form-field">
          <span>Иконка</span>
          <input type="text" name="icon" maxlength="8" placeholder="✨" value="${escapeHtml(habit?.icon ?? '✨')}">
        </label>
        <label class="form-field">
          <span>Сфера</span>
          <select name="sphere">
            ${Object.values(SPHERES).map(s => `<option value="${escapeHtml(s)}" ${habit?.sphere === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="form-field">
        <span>Триггер (после чего делаешь)</span>
        <input type="text" name="trigger" maxlength="200" placeholder="После утреннего кофе" value="${escapeHtml(habit?.trigger ?? '')}">
      </label>
      <div class="form-row">
        <label class="form-field">
          <span>Норма</span>
          <input type="text" name="norm" maxlength="50" placeholder="Выполнено" value="${escapeHtml(habit?.norm ?? 'Выполнено')}">
        </label>
        <label class="form-field">
          <span>План Б (минимум)</span>
          <input type="text" name="planB" maxlength="50" placeholder="Минимум 2 мин" value="${escapeHtml(habit?.planB ?? 'Минимум')}">
        </label>
      </div>
      <label class="form-field">
        <span>Капсула времени (письмо себе)</span>
        <textarea name="capsule" maxlength="500" rows="2" placeholder="Напоминание себе, зачем ты начал(а)...">${escapeHtml(habit?.capsule ?? '')}</textarea>
      </label>
      <div class="form-actions">
        ${habit ? `<button type="button" id="deleteHabitBtn" class="habit-action-btn danger">Удалить</button>` : ''}
        <button type="submit" class="habit-action-btn primary">Сохранить</button>
      </div>
    </form>
  `;
}
