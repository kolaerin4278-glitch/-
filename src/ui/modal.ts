import { telegram } from '../telegram';
import { escapeHtml } from '../utils';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ConfirmModalOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
  readonly requireConfirmationWord?: string;
}

class ModalManager {
  private overlay: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private onCloseCallback: (() => void) | null = null;
  private sheetAbort: AbortController | null = null;
  private readonly backHandler: () => void;

  constructor() {
    this.backHandler = () => this.close();
    if (typeof document !== 'undefined') {
      this.ensureMounted();
    }
  }

  private ensureMounted(): void {
    if (this.overlay || typeof document === 'undefined') return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet glass-surface-4';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'modalDialogTitle');

    const dragHandle = document.createElement('div');
    dragHandle.className = 'sheet-drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');

    const header = document.createElement('div');
    header.className = 'modal-header';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close-btn';
    closeBtn.setAttribute('aria-label', 'Закрыть окно');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'modal-content';

    sheet.append(dragHandle, header, content);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('active')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') {
        this.trapTabKey(e);
      }
    });

    this.attachPullToDismiss(dragHandle, sheet);

    this.overlay = overlay;
    this.sheet = sheet;
    this.content = content;
  }

  private trapTabKey(e: KeyboardEvent): void {
    if (!this.sheet) return;
    const focusables = Array.from(this.sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private attachPullToDismiss(handle: HTMLElement, sheet: HTMLElement): void {
    let startY = 0;
    let dragging = false;

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      sheet.style.transition = 'none';
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });

    const finish = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      const dy = e.clientY - startY;
      sheet.style.transition = 'transform 0.3s var(--spring)';
      if (dy > 95) {
        sheet.style.transform = '';
        this.close();
      } else {
        sheet.style.transform = 'translateY(0)';
      }
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  open(
    htmlContent: string,
    onMount?: (container: HTMLElement, signal: AbortSignal) => void,
    onClose?: () => void
  ): void {
    this.ensureMounted();
    if (!this.overlay || !this.content || !this.sheet) return;

    this.sheetAbort?.abort();
    this.sheetAbort = new AbortController();

    this.previousFocus = document.activeElement as HTMLElement | null;
    this.onCloseCallback = onClose ?? null;
    this.content.innerHTML = htmlContent;

    const titleEl = this.content.querySelector('h2, h3, .modal-title');
    if (titleEl && !titleEl.id) {
      titleEl.id = 'modalDialogTitle';
    }

    const appRoot = document.getElementById('app');
    if (appRoot) {
      appRoot.setAttribute('inert', '');
    }

    this.overlay.classList.add('active');
    this.overlay.setAttribute('aria-hidden', 'false');
    telegram.showBackButton(this.backHandler);

    if (onMount) {
      onMount(this.content, this.sheetAbort.signal);
    }

    const firstInput = this.content.querySelector<HTMLElement>('input, select, textarea, button');
    if (firstInput) {
      requestAnimationFrame(() => firstInput.focus());
    }
  }

  close(): void {
    if (!this.overlay || !this.overlay.classList.contains('active')) return;

    this.sheetAbort?.abort();
    this.sheetAbort = null;

    this.overlay.classList.remove('active');
    this.overlay.setAttribute('aria-hidden', 'true');
    telegram.hideBackButton(this.backHandler);
    telegram.hideMainButton();

    const appRoot = document.getElementById('app');
    if (appRoot) {
      appRoot.removeAttribute('inert');
    }

    if (this.onCloseCallback) {
      const cb = this.onCloseCallback;
      this.onCloseCallback = null;
      cb();
    }

    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      const focusTarget = this.previousFocus;
      this.previousFocus = null;
      requestAnimationFrame(() => focusTarget.focus());
    }
  }

  confirm(options: ConfirmModalOptions): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const word = options.requireConfirmationWord;

      const html = `
        <div class="habit-form">
          <h3 class="modal-title">${escapeHtml(options.title)}</h3>
          <p class="settings-desc">${escapeHtml(options.message)}</p>
          ${
            word
              ? `<label class="form-field">
                  <span>Введите слово <strong>${escapeHtml(word)}</strong> для подтверждения</span>
                  <input type="text" id="confirmWordInput" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(word)}">
                </label>`
              : ''
          }
          <div class="form-actions">
            <button type="button" id="confirmCancelBtn" class="habit-action-btn">${escapeHtml(options.cancelLabel ?? 'Отмена')}</button>
            <button type="button" id="confirmApproveBtn" class="habit-action-btn ${options.danger ? 'danger' : 'primary'}" ${word ? 'disabled' : ''}>
              ${escapeHtml(options.confirmLabel ?? 'Подтвердить')}
            </button>
          </div>
        </div>
      `;

      this.open(
        html,
        (container, signal) => {
          const approveBtn = container.querySelector('#confirmApproveBtn') as HTMLButtonElement | null;
          const cancelBtn = container.querySelector('#confirmCancelBtn') as HTMLButtonElement | null;
          const wordInput = container.querySelector('#confirmWordInput') as HTMLInputElement | null;

          if (word && wordInput && approveBtn) {
            wordInput.addEventListener(
              'input',
              () => {
                approveBtn.disabled = wordInput.value.trim().toUpperCase() !== word.toUpperCase();
              },
              { signal }
            );
          }

          cancelBtn?.addEventListener(
            'click',
            () => {
              resolved = true;
              this.close();
              resolve(false);
            },
            { signal }
          );

          approveBtn?.addEventListener(
            'click',
            () => {
              resolved = true;
              this.close();
              resolve(true);
            },
            { signal }
          );
        },
        () => {
          if (!resolved) resolve(false);
        }
      );
    });
  }
}

export const modalManager = new ModalManager();
