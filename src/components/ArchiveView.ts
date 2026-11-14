import { storage } from '../storage';
import type { Habit } from '../core/types';

/**
 * Компонент отображения архивированных привычек.
 * Архив — это привычки, временно приостановленные пользователем.
 * Они сохраняют всю историю и могут быть легко возобновлены.
 */

export function renderArchiveView(): string {
  const archived = storage.getArchivedHabits();
  
  if (archived.length === 0) {
    return `
      <div class="archive-empty-state">
        <div class="empty-state-icon">📦</div>
        <h2 class="empty-state-title">Архив пуст</h2>
        <p class="empty-state-text">
          Приостановленные привычки появятся здесь.<br>
          Они сохраняют историю и могут быть возобновлены в любой момент.
        </p>
      </div>
    `;
  }

  return `
    <div class="archive-view">
      <div class="archive-header">
        <h2 class="archive-title">Архив</h2>
        <p class="archive-subtitle">${archived.length} ${pluralize(archived.length, 'привычка', 'привычки', 'привычек')}</p>
      </div>
      
      <div class="archive-list">
        ${archived.map((habit) => renderArchivedHabitCard(habit)).join('')}
      </div>
    </div>
  `;
}

function renderArchivedHabitCard(habit: Habit): string {
  const archivedDate = habit.archivedAt ? new Date(habit.archivedAt).toLocaleDateString('ru-RU') : '';
  
  return `
    <div class="archived-habit-card tap-feedback" data-habit-id="${habit.id}">
      <div class="archived-habit-icon">${habit.icon}</div>
      <div class="archived-habit-info">
        <div class="archived-habit-title">${habit.title}</div>
        <div class="archived-habit-meta">
          <span class="archived-habit-sphere" data-sphere="${habit.sphere}">${habit.sphere}</span>
          <span class="archived-habit-date">Архивировано ${archivedDate}</span>
        </div>
      </div>
      <button type="button" 
              class="archived-habit-restore-btn tap-feedback" 
              data-action="unarchive" 
              data-habit-id="${habit.id}"
              aria-label="Возобновить привычку">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
        </svg>
      </button>
    </div>
  `;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
