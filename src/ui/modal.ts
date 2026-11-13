import { telegram } from './telegram';

class ModalManager {
  private overlay: HTMLElement;
  private content: HTMLElement;
  private resolveClose: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <button class="modal-close-btn" aria-label="Закрыть">✕</button>
        </div>
        <div class="modal-content"></div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.content = this.overlay.querySelector('.modal-content') as HTMLElement;
    
    this.overlay.querySelector('.modal-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  async open(htmlContent: string): Promise<void> {
    this.content.innerHTML = htmlContent;
    this.overlay.classList.add('active');
    
    // Интеграция с Telegram: BackButton закрывает модалку
    telegram.showBackButton(() => this.close());
    
    return new Promise((resolve) => {
      this.resolveClose = resolve;
    });
  }

  close(): void {
    this.overlay.classList.remove('active');
    telegram.hideBackButton();
    if (this.resolveClose) {
      this.resolveClose();
      this.resolveClose = null;
    }
  }
}

export const modalManager = new ModalManager();
