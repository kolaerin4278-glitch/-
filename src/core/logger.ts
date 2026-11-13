import { APP_VERSION, DIAG_LOG_KEY, MAX_DIAG_ENTRIES } from '../constants';
import { HabitDiaryError, scrubErrorContext } from './errors';
import { eventBus } from './event-bus';
import { createEntityId } from './id';
import type { DiagnosticLogEntry } from './types';

class DiagnosticLogger {
  private entries: DiagnosticLogEntry[] = [];
  private globalHandlersBound = false;

  constructor() {
    this.loadPersistedEntries();
  }

  private loadPersistedEntries(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(DIAG_LOG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        this.entries = parsed
          .filter(
            (item): item is DiagnosticLogEntry =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as DiagnosticLogEntry).message === 'string' &&
              typeof (item as DiagnosticLogEntry).timestamp === 'number'
          )
          .slice(-MAX_DIAG_ENTRIES);
      }
    } catch {
      this.entries = [];
    }
  }

  private persistEntries(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(DIAG_LOG_KEY, JSON.stringify(this.entries.slice(-MAX_DIAG_ENTRIES)));
    } catch {
      // Игнорируем переполнение квоты при сохранении диагностического лога
    }
  }

  bindGlobalErrorHandlers(): void {
    if (this.globalHandlersBound || typeof window === 'undefined') return;
    this.globalHandlersBound = true;

    window.addEventListener('error', (event) => {
      const msg = event.error instanceof Error ? event.error.message : String(event.message || 'Runtime error');
      this.error('UNCAUGHT_ERROR', msg, {
        lineno: event.lineno ?? 0,
        colno: event.colno ?? 0
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection';
      this.error('UNHANDLED_REJECTION', msg);
    });
  }

  log(
    level: DiagnosticLogEntry['level'],
    code: string,
    message: string,
    rawContext?: Record<string, unknown>
  ): DiagnosticLogEntry {
    const cleanContext = scrubErrorContext(rawContext);
    const entry: DiagnosticLogEntry = {
      id: createEntityId('log'),
      level,
      code: code.slice(0, 64),
      message: message.slice(0, 300),
      timestamp: Date.now(),
      ...(cleanContext ? { context: cleanContext } : {})
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_DIAG_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_DIAG_ENTRIES);
    }
    this.persistEntries();
    eventBus.emit('diagnostics:logged', entry);
    return entry;
  }

  info(code: string, message: string, context?: Record<string, unknown>): void {
    this.log('info', code, message, context);
  }

  warn(code: string, message: string, context?: Record<string, unknown>): void {
    this.log('warn', code, message, context);
  }

  error(code: string, errorOrMessage: unknown, context?: Record<string, unknown>): void {
    if (errorOrMessage instanceof HabitDiaryError) {
      this.log('error', errorOrMessage.code, errorOrMessage.message, {
        ...errorOrMessage.context,
        ...context
      });
      return;
    }
    const msg =
      errorOrMessage instanceof Error
        ? errorOrMessage.message
        : typeof errorOrMessage === 'string'
          ? errorOrMessage
          : 'Unknown error';
    this.log('error', code, msg, context);
  }

  getEntries(): readonly DiagnosticLogEntry[] {
    return [...this.entries].reverse();
  }

  clear(): void {
    this.entries = [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(DIAG_LOG_KEY);
      }
    } catch {
      // ignore
    }
  }

  exportDiagnosticsReport(extraMetrics?: Record<string, string | number | boolean>): string {
    return JSON.stringify(
      {
        appVersion: APP_VERSION,
        generatedAt: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
        language: typeof navigator !== 'undefined' ? navigator.language : 'ru-RU',
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        viewport:
          typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'headless',
        metrics: extraMetrics ?? {},
        recentErrorsAndEvents: this.getEntries()
      },
      null,
      2
    );
  }
}

export const logger = new DiagnosticLogger();
