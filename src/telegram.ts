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
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  viewportStableHeight: number;
  isExpanded: boolean;
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
    } catch (error) {
      console.error('Failed to initialize Telegram WebApp:', error);
    }
  }

  private init(): void {
    if (!this.tg) return;
    
    try {
      this.tg.ready();
      this.tg.expand();
      
      // Применяем тему Telegram к нашим CSS-переменным
      if (this.tg.themeParams.bg_color) {
        document.documentElement.style.setProperty('--tg-bg', this.tg.themeParams.bg_color);
      }
      if (this.tg.themeParams.text_color) {
        document.documentElement.style.setProperty('--tg-text', this.tg.themeParams.text_color);
      }
      
    } catch (error) {
      console.error('Failed to initialize Telegram WebApp:', error);
    }
  }

  isAvailable(): boolean {
    return this.tg !== null;
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
    } catch (error) {
      // Игнорируем ошибки haptic в обычном браузере
    }
  }

  showBackButton(onClick: () => void): void {
    if (!this.tg?.BackButton) return;
    
    try {
      this.tg.BackButton.onClick(onClick);
      this.tg.BackButton.show();
    } catch (error) {
      console.error('Failed to show back button:', error);
    }
  }

  hideBackButton(onClick?: () => void): void {
    if (!this.tg?.BackButton) return;
    
    try {
      if (onClick) {
        this.tg.BackButton.offClick(onClick);
      }
      this.tg.BackButton.hide();
    } catch (error) {
      console.error('Failed to hide back button:', error);
    }
  }

  close(): void {
    if (!this.tg) return;
    
    try {
      this.tg.close();
    } catch (error) {
      console.error('Failed to close WebApp:', error);
    }
  }

  async cloudStorageSet(key: string, value: string): Promise<boolean> {
    if (!this.tg?.CloudStorage) return false;
    
    return new Promise((resolve) => {
      this.tg!.CloudStorage.setItem(key, value, (error, success) => {
        if (error) {
          console.error('CloudStorage setItem error:', error);
          resolve(false);
        } else {
          resolve(success);
        }
      });
    });
  }

  async cloudStorageGet(key: string): Promise<string | null> {
    if (!this.tg?.CloudStorage) return null;
    
    return new Promise((resolve) => {
      this.tg!.CloudStorage.getItem(key, (error, value) => {
        if (error) {
          console.error('CloudStorage getItem error:', error);
          resolve(null);
        } else {
          resolve(value);
        }
      });
    });
  }
}

export const telegram = new TelegramWebAppWrapper();
