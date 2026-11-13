import { telegram } from '../telegram';

class ModalManager {
  private overlay: HTMLElement;
  private content: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private previousFocus: HTMLElement | null = null;
  private onCloseCallback: (() => void) | null = null;
  private backHandler: () => void;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.innerHTML = `
      <div class="modal-sheet" role="dialog" aria-modal="true">
        <div class="modal-header">
          <button type="button" class="modal-close-btn" aria-label="Закрыть">✕</button>
        </div>
        <div class="modal-content"></div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.content = this.overlay.querySelector('.modal-content') as HTMLElement;
    this.closeBtn = this.overlay.querySelector('.modal-close-btn') as HTMLButtonElement;
    this.backHandler = () => this.close();

    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
        this.close();
      }
    });
  }

  open(htmlContent: string, onMount?: (container: HTMLElement) => void, onClose?: () => void): void {
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.onCloseCallback = onClose ?? null;
    this.content.innerHTML = htmlContent;
    this.overlay.classList.add('active');
    this.overlay.setAttribute('aria-hidden', 'false');

    telegram.showBackButton(this.backHandler);

    if (onMount) {
      onMount(this.content);
    }

    const firstInput = this.content.querySelector<HTMLElement>('input, select, textarea, button');
    if (firstInput) {
      requestAnimationFrame(() => firstInput.focus());
    }
  }

  close(): void {
    if (!this.overlay.classList.contains('active')) return;
    this.overlay.classList.remove('active');
    this.overlay.setAttribute('aria-hidden', 'true');
    telegram.hideBackButton(this.backHandler);

    if (this.onCloseCallback) {
      this.onCloseCallback();
      this.onCloseCallback = null;
    }

    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      this.previousFocus.focus();
      this.previousFocus = null;
    }
  }
}

export const modalManager = new ModalManager();
