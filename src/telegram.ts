import { isTrustedTelegramOrigin } from './core/security';

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  colorScheme?: 'light' | 'dark';
  initDataUnsafe: {
    user?: TelegramUser;
  };
  themeParams: {
    bg_color?: string;
    secondary_bg_color?: string;
    section_bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  viewportStableHeight: number;
  isExpanded: boolean;
  onEvent?: (eventType: string, callback: () => void) => void;
  shareToStory?: (mediaUrl: string, params?: { text?: string }) => void;
  showPopup?: (params: {
    title?: string;
    message: string;
    buttons?: Array<{ id?: string; text?: string; type?: 'default' | 'ok' | 'cancel'; url?: string }>;
  }) => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  CloudStorage: {
    setItem: (key: string, value: string, callback?: (error: Error | null, success: boolean) => void) => void;
    getItem: (key: string, callback: (error: Error | null, value: string) => void) => void;
    getItems: (keys: string[], callback: (error: Error | null, values: Record<string, string>) => void) => void;
    removeItem: (key: string, callback?: (error: Error | null, success: boolean) => void) => void;
    removeItems: (keys: string[], callback?: (error: Error | null, success: boolean) => void) => void;
    getKeys: (callback: (error: Error | null, keys: string[]) => void) => void;
  };
}

class TelegramWebAppWrapper {
  private tg: TelegramWebApp | null = null;
  private hapticLastCall = 0;
  private readonly hapticThrottle = 50;
  private hapticEnabled = true;
  private mainButtonCallback: (() => void) | null = null;

  constructor() {
    try {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        this.tg = window.Telegram.WebApp;
        this.init();
      }
    } catch {
      // Безопасный fallback вне Telegram
    }
  }

  private init(): void {
    if (!this.tg) return;

    try {
      this.tg.ready();
      this.tg.expand();
      this.syncViewportHeight();
      this.applyTheme();
      this.tg.onEvent?.('themeChanged', () => this.applyTheme());
      this.tg.onEvent?.('viewportChanged', () => this.syncViewportHeight());

      if (typeof window !== 'undefined') {
        window.addEventListener('message', (ev) => {
          if (ev.origin && !isTrustedTelegramOrigin(ev.origin)) {
            return;
          }
        });
      }
    } catch {
      // ignore outside Telegram WebView
    }
  }

  setHapticEnabled(enabled: boolean): void {
    this.hapticEnabled = enabled;
  }

  private syncViewportHeight(): void {
    if (!this.tg || typeof document === 'undefined') return;
    if (this.tg.viewportStableHeight > 0) {
      document.documentElement.style.setProperty(
        '--tg-viewport-stable-height',
        `${this.tg.viewportStableHeight}px`
      );
    }
  }

  applyTheme(themeOverride: 'auto' | 'dark' | 'light' = 'auto'): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const tgLight = this.tg?.colorScheme === 'light';
    const sysLight =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches;

    const effectiveLight =
      themeOverride === 'light' || (themeOverride === 'auto' && (this.isAvailable() ? tgLight : sysLight));

    root.dataset['theme'] = effectiveLight ? 'light' : 'dark';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    metaTheme?.setAttribute('content', effectiveLight ? '#EEF2F8' : '#07090E');
  }

  isAvailable(): boolean {
    return this.tg !== null && this.tg.initData.length > 0;
  }

  getInitData(): string {
    return this.tg?.initData ?? '';
  }

  getUserId(): number | null {
    return this.tg?.initDataUnsafe.user?.id ?? null;
  }

  getUser(): TelegramUser | null {
    return this.tg?.initDataUnsafe.user ?? null;
  }

  haptic(style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' = 'light'): void {
    if (!this.hapticEnabled) return;
    const now = Date.now();
    if (now - this.hapticLastCall < this.hapticThrottle) return;
    this.hapticLastCall = now;

    try {
      if (this.tg?.HapticFeedback && this.isAvailable()) {
        this.tg.HapticFeedback.impactOccurred(style);
        return;
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(style === 'heavy' ? 20 : style === 'medium' ? 12 : 6);
      }
    } catch {
      // ignore haptic failure
    }
  }

  hapticSelection(): void {
    if (!this.hapticEnabled) return;
    const now = Date.now();
    if (now - this.hapticLastCall < this.hapticThrottle) return;
    this.hapticLastCall = now;
    try {
      if (this.tg?.HapticFeedback && this.isAvailable()) {
        this.tg.HapticFeedback.selectionChanged();
      } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(5);
      }
    } catch {
      // ignore
    }
  }

  hapticNotification(type: 'success' | 'warning' | 'error'): void {
    if (!this.hapticEnabled) return;
    try {
      if (this.tg?.HapticFeedback && this.isAvailable()) {
        this.tg.HapticFeedback.notificationOccurred(type);
      } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(type === 'error' ? [25, 40, 25] : 15);
      }
    } catch {
      // ignore
    }
  }

  showBackButton(onClick: () => void): void {
    if (!this.tg?.BackButton) return;
    try {
      this.tg.BackButton.onClick(onClick);
      this.tg.BackButton.show();
    } catch {
      // ignore
    }
  }

  hideBackButton(onClick?: () => void): void {
    if (!this.tg?.BackButton) return;
    try {
      if (onClick) {
        this.tg.BackButton.offClick(onClick);
      }
      this.tg.BackButton.hide();
    } catch {
      // ignore
    }
  }

  showMainButton(text: string, onClick: () => void): void {
    if (!this.tg?.MainButton || !this.isAvailable()) return;
    try {
      if (this.mainButtonCallback) {
        this.tg.MainButton.offClick(this.mainButtonCallback);
      }
      let locked = false;
      this.mainButtonCallback = () => {
        if (locked) return;
        locked = true;
        try {
          onClick();
        } finally {
          setTimeout(() => {
            locked = false;
          }, 400);
        }
      };
      this.tg.MainButton.setText(text);
      this.tg.MainButton.onClick(this.mainButtonCallback);
      this.tg.MainButton.enable();
      this.tg.MainButton.show();
    } catch {
      // ignore
    }
  }

  hideMainButton(): void {
    if (!this.tg?.MainButton) return;
    try {
      if (this.mainButtonCallback) {
        this.tg.MainButton.offClick(this.mainButtonCallback);
        this.mainButtonCallback = null;
      }
      this.tg.MainButton.hide();
    } catch {
      // ignore
    }
  }

  canShareToStory(): boolean {
    return Boolean(this.tg?.shareToStory && this.isAvailable());
  }

  shareToStory(mediaUrl: string, caption?: string): boolean {
    if (!this.tg?.shareToStory) return false;
    try {
      this.tg.shareToStory(mediaUrl, caption ? { text: caption } : undefined);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Показывает нативный попап Telegram (п. 0315).
   * Возвращает `true`, если попап был показан.
   */
  showPopup(params: {
    title?: string;
    message: string;
    buttons?: ReadonlyArray<{ id?: string; text?: string; type?: 'default' | 'ok' | 'cancel'; url?: string }>;
  }): boolean {
    if (!this.tg?.showPopup || !this.isAvailable()) return false;
    try {
      const buttons = (params.buttons ?? [{ type: 'ok', text: 'OK' }]).map((b) => ({
        id: b.id,
        text: b.text,
        type: b.type,
        url: b.url
      }));
      this.tg.showPopup({
        title: params.title,
        message: params.message,
        buttons
      });
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    try {
      this.tg?.close();
    } catch {
      // ignore
    }
  }

  async cloudStorageSet(key: string, value: string): Promise<boolean> {
    if (!this.tg?.CloudStorage || !this.isAvailable()) return false;
    return new Promise((resolve) => {
      try {
        this.tg!.CloudStorage.setItem(key, value, (error, success) => {
          resolve(!error && Boolean(success));
        });
      } catch {
        resolve(false);
      }
    });
  }

  async cloudStorageGet(key: string): Promise<string | null> {
    if (!this.tg?.CloudStorage || !this.isAvailable()) return null;
    return new Promise((resolve) => {
      try {
        this.tg!.CloudStorage.getItem(key, (error, value) => {
          resolve(error ? null : value);
        });
      } catch {
        resolve(null);
      }
    });
  }
}

export const telegram = new TelegramWebAppWrapper();
