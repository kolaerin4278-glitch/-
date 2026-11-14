import { storage } from '../storage';
import { contextMenu, type ContextMenuItem } from '../ui/contextMenu';
import { islandManager } from '../ui/island';
import { telegram } from '../telegram';
import { animateRemove, animateRestoreOut, animateTrashIn } from '../animations';

/**
 * Контроллер жизненного цикла привычки (план 04, п. 0356–0363, 0373, 0377, 0388).
 *
 * Отвечает за операции, которые меняют «состояние существования» привычки:
 * клонирование, архивацию, удаление в корзину, восстановление.
 */
export class LifecycleController {

  /**
   * Контекстное меню привычки: клонировать, в архив, в корзину.
   */
  static openMenu(habitId: string, x: number, y: number): void {
    const habit = storage.getState().habits.find((h) => h.id === habitId);
    if (!habit) return;

    const items: ContextMenuItem[] = [
      {
        id: 'clone',
        label: 'Создать копию',
        icon: '📋',
        onSelect: () => this.clone(habitId)
      },
      {
        id: 'archive',
        label: 'В архив (на паузу)',
        icon: '📦',
        dividerBefore: true,
        onSelect: () => this.archive(habitId)
      },
      {
        id: 'trash',
        label: 'В корзину',
        icon: '🗑️',
        danger: true,
        onSelect: () => this.moveToTrash(habitId)
      }
    ];

    contextMenu.open(habit.title, items, x, y);
  }

  /**
   * Клонирование привычки (п. 0356).
   */
  static clone(habitId: string): void {
    const copy = storage.duplicateHabit(habitId);
    if (!copy) return;
    telegram.haptic('medium');
    islandManager.show({
      message: `Создана копия «${copy.title}»`,
      icon: '📋'
    });
  }

  /**
   * Архивация привычки — временная пауза с сохранением истории (п. 0358).
   * Карточка мягко уезжает в сторону индикатора архива.
   */
  static archive(habitId: string, element?: HTMLElement | null): void {
    const habit = storage.getState().habits.find((h) => h.id === habitId);
    if (!habit) return;

    const apply = (): void => {
      storage.archiveHabit(habitId, true);
      telegram.haptic('medium');
      islandManager.show({
        message: 'Привычка в архиве. История сохранена',
        icon: '📦',
        undoLabel: 'Вернуть',
        onUndo: () => storage.archiveHabit(habitId, false)
      });
    };

    const target = element ?? this.findHabitElement(habitId);
    if (!target) {
      apply();
      return;
    }

    const archiveIndicator = document.querySelector<HTMLElement>('.archive-indicator');
    void animateTrashIn(target, archiveIndicator).then(apply);
  }

  /**
   * Мягкое удаление в корзину с анимацией «втягивания» (п. 0359, 0388).
   */
  static moveToTrash(habitId: string, element?: HTMLElement | null): void {
    const habit = storage.getState().habits.find((h) => h.id === habitId);
    if (!habit) return;

    const apply = (): void => {
      storage.deleteHabit(habitId, false);
      telegram.hapticNotification('warning');
      islandManager.show({
        message: `«${habit.title}» в корзине`,
        icon: '🗑️',
        undoLabel: 'Вернуть',
        onUndo: () => storage.restoreHabitFromTrash(habitId)
      });
    };

    const target = element ?? this.findHabitElement(habitId);
    if (!target) {
      apply();
      return;
    }

    // Карточка «втягивается» в иконку корзины, затем схлопывается по высоте.
    void animateTrashIn(target, this.findTrashTarget()).then(apply);
  }

  /**
   * Возврат привычки из корзины (п. 0360, 0377).
   * Карточка «вылетает» из корзины и пружинно садится на своё место.
   */
  static restoreFromTrash(habitId: string, element?: HTMLElement | null): void {
    const target = element ?? this.findHabitElement(habitId);

    const apply = (): void => {
      storage.restoreHabitFromTrash(habitId);
      telegram.haptic('medium');
      islandManager.show({
        message: 'Привычка возвращена в ленту',
        icon: '♻️'
      });
    };

    if (!target) {
      apply();
      return;
    }

    // Анимация «вылета» идёт до изменения состояния, чтобы карточка
    // успела отыграть движение, а список перерисовался уже после.
    animateRestoreOut(target);
    window.setTimeout(apply, 220);
  }

  /**
   * Безвозвратное удаление (п. 0363).
   */
  static deleteForever(habitId: string): void {
    storage.deleteHabit(habitId, true);
    telegram.hapticNotification('warning');
    islandManager.show({
      message: 'Привычка удалена навсегда',
      icon: '⚰️'
    });
  }

  /**
   * Групповая операция над набором привычек (п. 0373).
   */
  static bulkArchive(habitIds: readonly string[]): void {
    for (const id of habitIds) {
      storage.archiveHabit(id, true);
    }
    telegram.haptic('medium');
    islandManager.show({
      message: `В архив: ${habitIds.length}`,
      icon: '📦'
    });
  }

  static bulkTrash(habitIds: readonly string[]): void {
    for (const id of habitIds) {
      storage.deleteHabit(id, false);
    }
    telegram.hapticNotification('warning');
    islandManager.show({
      message: `В корзину: ${habitIds.length}`,
      icon: '🗑️'
    });
  }

  /* ==================== внутренние помощники ==================== */

  /** Ищет карточку привычки в текущей ленте. */
  private static findHabitElement(habitId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.habit-card[data-habit-id="${habitId}"]`);
  }

  /** Ищет визуальную цель для анимации «втягивания» (иконка корзины). */
  private static findTrashTarget(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('#trashDropTarget') ??
      document.querySelector<HTMLElement>('.trash-empty-all-btn') ??
      document.querySelector<HTMLElement>('.archive-indicator')
    );
  }
}

/** Переиспользуем для «мягкого» схлопывания при отказе от анимации корзины. */
export { animateRemove };
