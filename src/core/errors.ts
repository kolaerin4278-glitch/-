export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'BUSINESS_RULE_ERROR'
  | 'STORAGE_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'INTEGRITY_ERROR'
  | 'MIGRATION_ERROR'
  | 'SYNC_CONFLICT'
  | 'SYNC_NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'SECURITY_ERROR'
  | 'IMPORT_INVALID';

export interface ErrorMetadata {
  readonly code: ErrorCode;
  readonly recoverable: boolean;
  readonly timestamp: number;
  readonly context?: Record<string, string | number | boolean>;
}

const SENSITIVE_KEYS = /token|secret|password|pin|capsule|note|gratitude|initdata|hash/i;

export function scrubErrorContext(
  raw?: Record<string, unknown>
): Record<string, string | number | boolean> | undefined {
  if (!raw) return undefined;
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (SENSITIVE_KEYS.test(key)) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'string') {
      clean[key] = val.slice(0, 120);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      clean[key] = val;
    }
  }
  return clean;
}

export class HabitDiaryError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly timestamp: number;
  public readonly context: Record<string, string | number | boolean> | undefined;

  constructor(
    message: string,
    code: ErrorCode,
    recoverable = true,
    rawContext?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HabitDiaryError';
    this.code = code;
    this.recoverable = recoverable;
    this.timestamp = Date.now();
    this.context = scrubErrorContext(rawContext);
  }
}

export class ValidationError extends HabitDiaryError {
  public readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', true, field ? { field } : undefined);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class BusinessRuleError extends HabitDiaryError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BUSINESS_RULE_ERROR', true, context);
    this.name = 'BusinessRuleError';
  }
}

export class StorageError extends HabitDiaryError {
  constructor(message: string, recoverable = true, context?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', recoverable, context);
    this.name = 'StorageError';
  }
}

export class QuotaExceededStorageError extends HabitDiaryError {
  constructor(message = 'Хранилище устройства заполнено. Очистите старые снимки или экспортируйте архив.') {
    super(message, 'QUOTA_EXCEEDED', true);
    this.name = 'QuotaExceededStorageError';
  }
}

export class IntegrityError extends HabitDiaryError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INTEGRITY_ERROR', false, context);
    this.name = 'IntegrityError';
  }
}

export class RateLimitError extends HabitDiaryError {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('Слишком много запросов к серверу, синхронизация временно отложена.', 'RATE_LIMITED', true, {
      retryAfterMs
    });
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class SecurityError extends HabitDiaryError {
  constructor(message: string) {
    super(message, 'SECURITY_ERROR', false);
    this.name = 'SecurityError';
  }
}
