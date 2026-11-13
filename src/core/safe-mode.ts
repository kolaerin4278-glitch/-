import { eventBus } from './event-bus';
import { logger } from './logger';

export interface SafeModeRecoveryActions {
  onExportEmergencyRaw: () => void;
  onRestoreLatestSnapshot: () => Promise<boolean>;
  onResetCleanDatabase: () => Promise<void>;
}

class SafeModeController {
  private active = false;
  private reason = '';
  private bannerEl: HTMLElement | null = null;

  isActive(): boolean {
    return this.active;
  }

  getReason(): string {
    return this.reason;
  }

  activate(reason: string, actions?: SafeModeRecoveryActions): void {
    this.active = true;
    this.reason = reason;
    logger.error('SAFE_MODE_ACTIVATED', reason);
    eventBus.emit('safe-mode:activated', { reason });

    if (typeof document === 'undefined') return;
    this.mountRecoveryBanner(actions);
  }

  deactivate(): void {
    this.active = false;
    this.reason = '';
    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
    }
  }

  private mountRecoveryBanner(actions?: SafeModeRecoveryActions): void {
    if (this.bannerEl) this.bannerEl.remove();

    const container = document.createElement('section');
    container.className = 'safe-mode-banner glass-card';
    container.setAttribute('role', 'alert');

    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Включён безопасный режим восстановления';

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent = `Обнаружена проблема целостности хранилища (${this.reason}). Ваши данные защищены от перезаписи: вы можете скачать аварийную копию или восстановиться из снимка.`;

    const btnRow = document.createElement('div');
    btnRow.className = 'habit-actions';

    if (actions) {
      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'habit-action-btn';
      exportBtn.textContent = 'Скачать копию';
      exportBtn.addEventListener('click', () => actions.onExportEmergencyRaw());

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'habit-action-btn primary';
      restoreBtn.textContent = 'Восстановить снимок';
      restoreBtn.addEventListener('click', () => {
        void actions.onRestoreLatestSnapshot().then((ok) => {
          if (ok) this.deactivate();
        });
      });

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'habit-action-btn danger';
      resetBtn.textContent = 'Чистый старт';
      resetBtn.addEventListener('click', () => {
        void actions.onResetCleanDatabase().then(() => this.deactivate());
      });

      btnRow.append(exportBtn, restoreBtn, resetBtn);
    }

    container.append(title, desc, btnRow);
    document.body.prepend(container);
    this.bannerEl = container;
  }
}

export const safeMode = new SafeModeController();
