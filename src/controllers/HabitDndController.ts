import { storage } from '../storage';
import { telegram } from '../telegram';

/**
 * Drag-and-drop сортировка привычек в ленте (план 04).
 *
 * Работает на Pointer Events, поэтому одинаково ведёт себя
 * на мобильных (touch) и десктопе (mouse).
 */
export class HabitDndController {
  /**
   * Включает перетаскивание карточек в списке.
   */
  static enable(list: HTMLElement): void {
    if (list.dataset['dndReady'] === '1') return;
    list.dataset['dndReady'] = '1';

    let draggedId: string | null = null;

    const cards = (): HTMLElement[] =>
      Array.from(list.querySelectorAll<HTMLElement>('.habit-swipe-wrapper'));

    const clearIndicators = (): void => {
      cards().forEach((c) => c.classList.remove('drag-over', 'dragging'));
    };

    list.addEventListener('pointerdown', (e: PointerEvent) => {
      const handle = (e.target as HTMLElement).closest<HTMLElement>('.habit-drag-handle');
      if (!handle) return;
      const wrapper = handle.closest<HTMLElement>('.habit-swipe-wrapper');
      if (!wrapper) return;

      e.preventDefault();
      draggedId = wrapper.dataset['habitId'] ?? null;
      if (!draggedId) return;

      wrapper.classList.add('dragging');
      telegram.haptic('light');

      const move = (ev: PointerEvent): void => {
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = target?.closest<HTMLElement>('.habit-swipe-wrapper') ?? null;
        if (!over || over === wrapper) return;
        clearIndicators();
        over.classList.add('drag-over');
      };

      const up = (): void => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        clearIndicators();

        const over = list.querySelector<HTMLElement>('.habit-swipe-wrapper.drag-over');
        const dragged = draggedId;
        draggedId = null;
        if (!over || !dragged) return;

        const overId = over.dataset['habitId'];
        if (!overId || overId === dragged) return;

        // Новая последовательность: переносим dragged на позицию over
        const ordered = cards().map((c) => c.dataset['habitId'] ?? '');
        const fromIdx = ordered.indexOf(dragged);
        const toIdx = ordered.indexOf(overId);
        if (fromIdx === -1 || toIdx === -1) return;

        ordered.splice(fromIdx, 1);
        ordered.splice(toIdx, 0, dragged);

        storage.reorderHabits(ordered);
        telegram.haptic('medium');
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }
}
