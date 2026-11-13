declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  colorScheme?: 'light' | 'dark';
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
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

  constructor() {
    try {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        this.tg = window.Telegram.WebApp;
        this.init();
      }
    } catch {
      // Игнорируем ошибку вне Telegram
    }
  }

  private init(): void {
    if (!this.tg) return;

    try {
      this.tg.ready();
      this.tg.expand();
      this.applyTheme();
      this.tg.onEvent?.('themeChanged', () => this.applyTheme());
    } catch {
      // Безопасный fallback вне Telegram
    }
  }

  applyTheme(): void {
    if (!this.tg) return;
    const root = document.documentElement;
    const params = this.tg.themeParams;
    const isLight = this.tg.colorScheme === 'light';

    if (params.bg_color) {
      root.style.setProperty('--bg', params.bg_color);
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      metaTheme?.setAttribute('content', params.bg_color);
    }
    if (params.secondary_bg_color || params.section_bg_color) {
      root.style.setProperty('--card-grouped', params.secondary_bg_color ?? params.section_bg_color ?? '#16161A');
    }
    if (params.text_color) {
      root.style.setProperty('--text-primary', params.text_color);
    }
    if (params.hint_color) {
      root.style.setProperty('--text-secondary', params.hint_color);
    }

    if (isLight) {
      root.style.setProperty('--card-raised', '#E9E9EF');
      root.style.setProperty('--card-overlay', '#FFFFFF');
      root.style.setProperty('--glass-nav', 'rgba(245, 245, 247, 0.92)');
      root.style.setProperty('--glass-header', 'rgba(255, 255, 255, 0.92)');
      root.style.setProperty('--glass-border', 'rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--hairline', 'inset 0 0.5px 0.5px rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--shadow-ambient', '0 8px 24px rgba(0, 0, 0, 0.12)');
    }
  }

  isAvailable(): boolean {
    return this.tg !== null && this.tg.initData.length > 0;
  }

  getUserId(): number | null {
    return this.tg?.initDataUnsafe.user?.id ?? null;
  }

  getUser() {
    return this.tg?.initDataUnsafe.user ?? null;
  }

  haptic(style: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (!this.tg?.HapticFeedback) return;

    const now = Date.now();
    if (now - this.hapticLastCall < this.hapticThrottle) return;

    try {
      this.hapticLastCall = now;
      this.tg.HapticFeedback.impactOccurred(style);
    } catch {
      // Игнорируем ошибки haptic в обычном браузере
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

  close(): void {
    try {
      this.tg?.close();
    } catch {
      // ignore
    }
  }

  async cloudStorageSet(key: string, value: string): Promise<boolean> {
    if (!this.tg?.CloudStorage) return false;

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
    if (!this.tg?.CloudStorage) return null;

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
