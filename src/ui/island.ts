import { eventBus } from '../core/event-bus';

export interface IslandToastItem {
  readonly message: string;
  readonly icon?: string;
  readonly undoLabel?: string;
  readonly onUndo?: () => void;
  readonly durationMs?: number;
}

class DynamicIslandManager {
  private readonly queue: IslandToastItem[] = [];
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastShownAt = 0;
  private bound = false;

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    eventBus.on('island:notify', (payload) => {
      this.show(payload);
    });
  }

  show(item: IslandToastItem | string): void {
    const normalized: IslandToastItem =
      typeof item === 'string' ? { message: item } : item;

    const now = Date.now();
    // Троттлинг частых уведомлений не чаще 1 раза в 500 мс (План 05 п. 715)
    if (now - this.lastShownAt < 500 && !normalized.onUndo) {
      if (this.queue.length < 4) {
        this.queue.push(normalized);
      }
      return;
    }

    this.renderImmediate(normalized);
  }

  private renderImmediate(item: IslandToastItem): void {
    if (typeof document === 'undefined') return;
    const island = document.getElementById('dynamicIsland');
    if (!island) return;

    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }

    this.lastShownAt = Date.now();
    island.replaceChildren();

    if (item.icon) {
      const iconEl = document.createElement('span');
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = item.icon;
      island.appendChild(iconEl);
    }

    const msgEl = document.createElement('span');
    msgEl.className = 'island-msg';
    msgEl.textContent = item.message;
    island.appendChild(msgEl);

    if (item.onUndo) {
      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'island-undo-btn';
      undoBtn.textContent = item.undoLabel ?? 'Отменить';
      undoBtn.addEventListener('click', () => {
        this.dismiss();
        item.onUndo?.();
      });
      island.appendChild(undoBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'island-close-btn';
    closeBtn.setAttribute('aria-label', 'Скрыть уведомление');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.dismiss());
    island.appendChild(closeBtn);

    island.classList.add('show');

    const autoDuration =
      item.durationMs ?? (item.message.length > 36 || item.onUndo ? 4000 : 2600);

    this.activeTimer = setTimeout(() => {
      this.dismiss();
    }, autoDuration);
  }

  dismiss(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }

    if (typeof document !== 'undefined') {
      const island = document.getElementById('dynamicIsland');
      island?.classList.remove('show');
    }

    const next = this.queue.shift();
    if (next) {
      setTimeout(() => this.renderImmediate(next), 180);
    }
  }
}

export const islandManager = new DynamicIslandManager();
