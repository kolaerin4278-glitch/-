import { storage } from '../storage';
import { SPHERES } from '../constants';

export function getHabitFormHTML(habitId?: string): string {
  const habit = habitId ? storage.getHabits().find(h => h.id === habitId) : null;
  
  return `
    <form id="habitForm" class="habit-form">
      <h3>${habit ? 'Редактировать' : 'Новая привычка'}</h3>
      <input type="text" name="title" placeholder="Название" value="${habit?.title || ''}" required>
      <input type="text" name="icon" placeholder="Иконка (эмодзи)" value="${habit?.icon || '✨'}">
      <select name="sphere">
        ${Object.values(SPHERES).map(s => `<option value="${s}" ${habit?.sphere === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <input type="text" name="trigger" placeholder="Триггер (например: после кофе)" value="${habit?.trigger || ''}">
      <button type="submit" class="habit-action-btn primary">Сохранить</button>
    </form>
  `;
}
