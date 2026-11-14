import { storage } from '../storage';
import { TRASH_RETENTION_DAYS } from '../constants';
import type { Habit } from '../core/types';

/**
 * Компонент корзины (Trash Bin).
 * Показывает удалённые привычки с возможностью восстановления или окончательного удаления.
 * Срок хранения настраивается пользователем (п. 0378).
 * Режим «только чтение» скрывает действия (п. 0376).
 */

/** Текущий срок хранения в корзине (в днях). */
export function getTrashRetentionDays(): number {
  const configured = storage.getState().settings?.trashRetentionDays;
  return typeof configured === 'number' && configured > 0 ? configured : TRASH_RETENTION_DAYS;
}

/** Включён ли режим «только чтение» для корзины. */
export function isTrashReadOnly(): boolean {
  return storage.getState().settings?.trashReadOnly === true;
}

export function renderTrashView(): string {
  const deleted = storage.getDeletedHabits();
  const retentionDays = getTrashRetentionDays();
  const readOnly = isTrashReadOnly();

  if (deleted.length === 0) {
    return `
      <div class="trash-empty-state">
        <div class="empty-state-icon">🗑️</div>
        <h2 class="empty-state-title">Корзина пуста</h2>
        <p class="empty-state-text">
          Удалённые привычки появятся здесь.<br>
          Они хранятся ${retentionDays} дней и могут быть восстановлены.
        </p>
      </div>
    `;
  }

  return `
    <div class="trash-view">
      <div class="trash-header">
        <h2 class="trash-title">Корзина</h2>
        <p class="trash-subtitle">
          ${deleted.length} ${pluralize(deleted.length, 'привычка', 'привычки', 'привычек')} ·
          Хранятся ${retentionDays} дней
        </p>
        ${
          readOnly
            ? '<div class="trash-readonly-banner">Режим «только чтение» — действия с привычками скрыты</div>'
            : ''
        }
      </div>

      <div class="trash-list">
        ${deleted.map((habit) => renderDeletedHabitCard(habit, retentionDays, readOnly)).join('')}
      </div>

      ${
        readOnly
          ? ''
          : `
      <div class="trash-footer">
        <button type="button"
                class="trash-empty-all-btn"
                data-action="empty-trash"
                aria-label="Очистить корзину">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Очистить корзину
        </button>
      </div>`
      }
    </div>
  `;
}

function renderDeletedHabitCard(habit: Habit, retentionDays: number, readOnly: boolean): string {
  const deletedDate = habit.deletedAt ? new Date(habit.deletedAt) : new Date();
  const expiryDate = new Date(deletedDate.getTime() + retentionDays * 86_400_000);
  const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000);

  const expiryText = daysLeft > 0
    ? `Удалится через ${daysLeft} ${pluralize(daysLeft, 'день', 'дня', 'дней')}`
    : 'Удаляется...';

  return `
    <div class="deleted-habit-card tap-feedback" data-habit-id="${habit.id}">
      <div class="deleted-habit-icon deleted-habit-icon--faded">${habit.icon}</div>
      <div class="deleted-habit-info">
        <div class="deleted-habit-title">${habit.title}</div>
        <div class="deleted-habit-meta">
          <span class="deleted-habit-sphere" data-sphere="${habit.sphere}">${habit.sphere}</span>
          <span class="deleted-habit-expiry ${daysLeft <= 3 ? 'deleted-habit-expiry--urgent' : ''}">${expiryText}</span>
        </div>
      </div>
      ${
        readOnly
          ? ''
          : `
      <div class="deleted-habit-actions">
        <button type="button"
                class="deleted-habit-action-btn tap-feedback"
                data-action="restore"
                data-habit-id="${habit.id}"
                aria-label="Восстановить привычку">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
        </button>
        <button type="button"
                class="deleted-habit-action-btn deleted-habit-action-btn--danger tap-feedback"
                data-action="delete-forever"
                data-habit-id="${habit.id}"
                aria-label="Удалить навсегда">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`
      }
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

/**
 * Контроллер действий для корзины
 */
export class TrashController {
  static restore(habitId: string): void {
    if (isTrashReadOnly()) return;
    storage.restoreHabitFromTrash(habitId);
  }

  static deleteForever(habitId: string): void {
    if (isTrashReadOnly()) return;
    storage.deleteHabit(habitId, true);
  }

  static emptyTrash(): void {
    if (isTrashReadOnly()) return;
    const deleted = storage.getDeletedHabits();
    for (const habit of deleted) {
      storage.deleteHabit(habit.id, true);
    }
  }
}
