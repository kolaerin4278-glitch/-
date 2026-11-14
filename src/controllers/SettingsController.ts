import { storage } from '../storage';
import { modalManager } from '../ui/modal';
import { islandManager } from '../ui/island';

/**
 * Контроллер настроек: экспорт, импорт, сброс, граница суток.
 */
export class SettingsController {
  static bind(container: HTMLElement, signal: AbortSignal, onUpdate: () => void): void {
    const dayBoundarySelect = container.querySelector<HTMLSelectElement>('#dayBoundarySelect');
    const exportBtn = container.querySelector<HTMLButtonElement>('#exportJsonBtn');
    const importBtn = container.querySelector<HTMLButtonElement>('#importJsonBtn');
    const resetBtn = container.querySelector<HTMLButtonElement>('#resetDataBtn');

    dayBoundarySelect?.addEventListener(
      'change',
      () => {
        const hour = parseInt(dayBoundarySelect.value, 10);
        if (!isNaN(hour)) {
          storage.updateSettings({ dayBoundaryHour: hour });
          islandManager.show({ message: 'Граница суток изменена', icon: '⏰' });
          onUpdate();
        }
      },
      { signal }
    );

    exportBtn?.addEventListener(
      'click',
      async () => {
        try {
          const json = storage.exportJSON();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `habits-backup-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          islandManager.show({ message: 'Экспортировано', icon: '💾' });
        } catch (err) {
          islandManager.show({ message: 'Ошибка экспорта', icon: '⚠️' });
        }
      },
      { signal }
    );

    importBtn?.addEventListener(
      'click',
      () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.addEventListener(
          'change',
          async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
              const raw = await file.text();
              const ok = storage.importJSON(raw);
              if (ok) {
                islandManager.show({ message: 'Импортировано', icon: '✅' });
                onUpdate();
              } else {
                islandManager.show({ message: 'Неверный формат', icon: '⚠️' });
              }
            } catch {
              islandManager.show({ message: 'Ошибка импорта', icon: '⚠️' });
            }
          },
          { signal }
        );
        input.click();
      },
      { signal }
    );

    resetBtn?.addEventListener(
      'click',
      async () => {
        const confirmed = await modalManager.confirm({
          title: 'Сбросить все данные?',
          message: 'Все привычки, отметки и настройки будут удалены без возможности восстановления.',
          confirmLabel: 'Удалить всё',
          cancelLabel: 'Отмена',
          danger: true,
          requireConfirmationWord: 'СБРОС'
        });
        if (confirmed) {
          storage.clearAll();
          islandManager.show({ message: 'Все данные удалены', icon: '🗑️' });
          onUpdate();
        }
      },
      { signal }
    );
  }
}
