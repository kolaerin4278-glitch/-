export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly danger?: boolean;
  readonly dividerBefore?: boolean;
  readonly onSelect: () => void;
}

class GlassContextMenu {
  private menuEl: HTMLElement | null = null;
  private abortController: AbortController | null = null;

  private ensureMounted(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    if (this.menuEl) return this.menuEl;

    const el = document.createElement('div');
    el.className = 'glass-context-menu';
    el.setAttribute('role', 'menu');
    document.body.appendChild(el);
    this.menuEl = el;
    return el;
  }

  open(title: string, items: readonly ContextMenuItem[], x: number, y: number): void {
    const el = this.ensureMounted();
    if (!el) return;

    this.close();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    el.replaceChildren();

    const header = document.createElement('div');
    header.className = 'settings-desc';
    header.style.padding = '6px 12px 4px';
    header.style.fontWeight = '700';
    header.textContent = title;
    el.appendChild(header);

    const buttons: HTMLButtonElement[] = [];

    for (const item of items) {
      if (item.dividerBefore) {
        const div = document.createElement('div');
        div.className = 'context-menu-divider';
        div.setAttribute('role', 'separator');
        el.appendChild(div);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'context-menu-item';
      btn.setAttribute('role', 'menuitem');
      if (item.danger) {
        btn.style.color = 'var(--coral)';
      }

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.textContent = item.icon;
        btn.appendChild(iconSpan);
      }

      const textSpan = document.createElement('span');
      textSpan.textContent = item.label;
      btn.appendChild(textSpan);

      btn.addEventListener(
        'click',
        () => {
          this.close();
          item.onSelect();
        },
        { signal }
      );

      el.appendChild(btn);
      buttons.push(btn);
    }

    el.classList.add('open');

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rectWidth = 224;
    const rectHeight = Math.min(340, items.length * 46 + 44);
    const left = Math.max(12, Math.min(vw - rectWidth - 12, x));
    const top = Math.max(12, Math.min(vh - rectHeight - 24, y));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    buttons[0]?.focus();

    // Закрытие по внешнему клику через capture без setTimeout(..., 50)
    document.addEventListener(
      'pointerdown',
      (ev) => {
        if (!el.contains(ev.target as Node)) {
          this.close();
        }
      },
      { capture: true, signal }
    );

    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          this.close();
          return;
        }
        const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          buttons[(idx + 1) % buttons.length]?.focus();
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
        }
      },
      { signal }
    );
  }

  close(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.menuEl?.classList.remove('open');
  }
}

export const contextMenu = new GlassContextMenu();
