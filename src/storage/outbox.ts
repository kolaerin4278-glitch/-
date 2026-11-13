import { MAX_OUTBOX_SIZE, SYNC_PROTOCOL_VERSION } from '../constants';
import { RateLimitError } from '../core/errors';
import { eventBus } from '../core/event-bus';
import { createOperationId, getOrCreateDeviceId } from '../core/id';
import { logger } from '../core/logger';
import { decodeUtf8Base64Url, encodeUtf8Base64Url, sha256Hex } from '../core/security';
import type { AppState, Check, OutboxEntity, OutboxOperation } from '../core/types';
import { IndexedDBEngine, idbEngine } from './indexedDb';
import { migrateAndHealRawPayload, serializeAppState } from './migrations';
import { computeStateDiff, type StateDiffSummary } from './snapshots';

/**
 * Детерминированное разрешение конфликтов LWW (Last-Write-Wins) по (ts, deviceId)
 */
export function resolveCheckConflict(local: Check, incoming: Check): Check {
  if (incoming.ts > local.ts) return incoming;
  if (incoming.ts < local.ts) return local;
  const localDev = local.deviceId ?? '';
  const incDev = incoming.deviceId ?? '';
  return incDev >= localDev ? incoming : local;
}

export function mergeAppStatesLWW(current: AppState, incoming: AppState): AppState {
  const habitMap = new Map(current.habits.map((h) => [h.id, h]));
  for (const incH of incoming.habits) {
    const curH = habitMap.get(incH.id);
    if (!curH || incH.updatedAt >= curH.updatedAt) {
      habitMap.set(incH.id, incH);
    }
  }

  const mergedChecks = new Map(current.checks);
  incoming.checks.forEach((incC, key) => {
    const curC = mergedChecks.get(key);
    mergedChecks.set(key, curC ? resolveCheckConflict(curC, incC) : incC);
  });

  const mergedLogs = new Map(current.logs);
  incoming.logs.forEach((incL, dateKey) => {
    const curL = mergedLogs.get(dateKey);
    if (!curL || (incL.updatedAt ?? 0) >= (curL.updatedAt ?? 0)) {
      mergedLogs.set(dateKey, {
        ...curL,
        ...incL,
        shielded: Boolean(curL?.shielded || incL.shielded)
      });
    }
  });

  const ritualMap = new Map(current.rituals.map((r) => [r.id, r]));
  for (const incR of incoming.rituals) {
    const curR = ritualMap.get(incR.id);
    if (!curR || incR.updatedAt >= curR.updatedAt) {
      ritualMap.set(incR.id, incR);
    }
  }

  const gradMap = new Map(current.graduated.map((g) => [g.id, g]));
  for (const incG of incoming.graduated) {
    if (!gradMap.has(incG.id)) gradMap.set(incG.id, incG);
  }

  const refMap = new Map(current.reflections.map((w) => [w.weekKey, w]));
  for (const incW of incoming.reflections) {
    refMap.set(incW.weekKey, incW);
  }

  return {
    habits: Array.from(habitMap.values()).sort((a, b) => a.sort - b.sort),
    checks: mergedChecks,
    logs: mergedLogs,
    rituals: Array.from(ritualMap.values()),
    graduated: Array.from(gradMap.values()),
    reflections: Array.from(refMap.values()),
    settings: { ...current.settings, ...incoming.settings },
    lastSavedAt: Date.now()
  };
}

export class OutboxSyncManager {
  private queue = new Map<string, OutboxOperation>();
  private syncing = false;
  private apiEndpoint = '/api/sync';
  private syncEnabled = false;

  constructor(private readonly engine: IndexedDBEngine = idbEngine) {}

  configureEndpoint(endpoint: string, enabled: boolean): void {
    this.apiEndpoint = endpoint;
    this.syncEnabled = enabled;
  }

  async hydrate(initialOps: readonly OutboxOperation[]): Promise<void> {
    this.queue.clear();
    for (const op of initialOps) {
      if (op.status !== 'synced') {
        this.queue.set(op.opId, op);
      }
    }
    this.emitStatus('idle');
  }

  getPendingCount(): number {
    let count = 0;
    this.queue.forEach((op) => {
      if (op.status !== 'synced') count++;
    });
    return count;
  }

  async enqueue(
    entity: OutboxEntity,
    entityId: string,
    action: 'upsert' | 'delete',
    payload: unknown,
    priority: 1 | 2 | 3 = 2
  ): Promise<OutboxOperation> {
    // Дедупликация эквивалентных ожидающих операций над одной сущностью
    for (const [existingId, existingOp] of Array.from(this.queue.entries())) {
      if (existingOp.entity === entity && existingOp.entityId === entityId && existingOp.status === 'pending') {
        this.queue.delete(existingId);
        await this.engine.delete('outbox', existingId);
      }
    }

    const op: OutboxOperation = {
      opId: createOperationId(),
      entity,
      entityId,
      action,
      payload,
      priority,
      status: 'pending',
      attempts: 0,
      nextRetryAt: 0,
      ts: Date.now(),
      deviceId: getOrCreateDeviceId()
    };

    this.queue.set(op.opId, op);
    await this.engine.put('outbox', op.opId, op);
    await this.trimIfNeeded();
    this.emitStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle');
    return op;
  }

  private async trimIfNeeded(): Promise<void> {
    if (this.queue.size <= MAX_OUTBOX_SIZE) return;
    const sorted = Array.from(this.queue.values()).sort((a, b) => a.ts - b.ts);
    const excess = sorted.slice(0, this.queue.size - MAX_OUTBOX_SIZE);
    for (const item of excess) {
      this.queue.delete(item.opId);
      await this.engine.delete('outbox', item.opId);
    }
  }

  async flushBatch(authToken?: string): Promise<boolean> {
    if (!this.syncEnabled || this.syncing) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.emitStatus('offline');
      return false;
    }

    const now = Date.now();
    const ready = Array.from(this.queue.values())
      .filter((op) => (op.status === 'pending' || op.status === 'failed') && op.nextRetryAt <= now)
      .sort((a, b) => a.priority - b.priority || a.ts - b.ts)
      .slice(0, 50);

    if (ready.length === 0) return true;

    this.syncing = true;
    this.emitStatus('syncing');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Protocol': String(SYNC_PROTOCOL_VERSION),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          protocolVersion: SYNC_PROTOCOL_VERSION,
          deviceId: getOrCreateDeviceId(),
          operations: ready
        }),
        signal: controller.signal
      });

      if (response.status === 429) {
        const retryHeader = Number(response.headers.get('Retry-After') ?? '10');
        const waitMs = Math.max(2000, retryHeader * 1000);
        await this.scheduleRetry(ready, waitMs);
        throw new RateLimitError(waitMs);
      }

      if (!response.ok) {
        await this.scheduleRetry(ready);
        this.emitStatus('error');
        return false;
      }

      for (const op of ready) {
        this.queue.delete(op.opId);
        await this.engine.delete('outbox', op.opId);
      }
      this.emitStatus('synced');
      return true;
    } catch (err) {
      if (!(err instanceof RateLimitError)) {
        await this.scheduleRetry(ready);
      }
      logger.warn('OUTBOX_SYNC_DEFERRED', err instanceof Error ? err.message : 'Sync deferred');
      this.emitStatus('error');
      return false;
    } finally {
      clearTimeout(timeout);
      this.syncing = false;
    }
  }

  flushWithBeacon(): void {
    if (!this.syncEnabled || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return;
    }
    const pending = Array.from(this.queue.values()).slice(0, 25);
    if (pending.length === 0) return;
    try {
      const blob = new Blob(
        [
          JSON.stringify({
            protocolVersion: SYNC_PROTOCOL_VERSION,
            deviceId: getOrCreateDeviceId(),
            operations: pending
          })
        ],
        { type: 'application/json' }
      );
      navigator.sendBeacon(this.apiEndpoint, blob);
    } catch {
      // ignore beacon errors
    }
  }

  private async scheduleRetry(ops: readonly OutboxOperation[], fixedDelayMs?: number): Promise<void> {
    const now = Date.now();
    for (const op of ops) {
      const attempts = op.attempts + 1;
      // Экспоненциальный ретрай с полным джиттером (План 07, Волна 01 пп. 0053–0054)
      const expDelay = Math.min(300_000, 1000 * Math.pow(2, Math.min(8, attempts)));
      const jitter = Math.floor(Math.random() * 600);
      const delay = fixedDelayMs ?? expDelay + jitter;
      const updated: OutboxOperation = {
        ...op,
        status: 'failed',
        attempts,
        nextRetryAt: now + delay
      };
      this.queue.set(op.opId, updated);
      await this.engine.put('outbox', op.opId, updated);
    }
  }

  async clearAll(): Promise<void> {
    this.queue.clear();
    this.emitStatus('idle');
  }

  private emitStatus(status: 'idle' | 'syncing' | 'offline' | 'synced' | 'error'): void {
    eventBus.emit('sync:status', {
      status,
      pending: this.getPendingCount()
    });
  }
}

export interface SyncTokenPreview {
  readonly valid: boolean;
  readonly error?: string;
  readonly diff?: StateDiffSummary;
  readonly parsedState?: AppState;
  readonly exportedAt?: string;
}

/**
 * Генерирует переносимый подписанный контрольной суммой токен HD_SYNC_v3.<checksum>.<payload>
 * с использованием TextEncoder + Base64URL (без устаревших escape/unescape)
 */
export async function generatePortableSyncToken(state: AppState): Promise<string> {
  const serialized = serializeAppState(state);
  const checksum = (await sha256Hex(serialized)).slice(0, 16);
  const payload = encodeUtf8Base64Url(serialized);
  return `HD_SYNC_v3.${checksum}.${payload}`;
}

export async function previewPortableSyncToken(
  tokenOrJson: string,
  currentState: AppState
): Promise<SyncTokenPreview> {
  const trimmed = tokenOrJson.trim();
  if (!trimmed) {
    return { valid: false, error: 'Пустая строка синхронизации' };
  }

  try {
    let jsonStr = trimmed;

    if (trimmed.startsWith('HD_SYNC_v3.')) {
      const parts = trimmed.split('.');
      const expectedChecksum = parts[1] ?? '';
      const b64Payload = parts.slice(2).join('.');
      if (!expectedChecksum || !b64Payload) {
        return { valid: false, error: 'Неверный формат токена HD_SYNC_v3' };
      }
      jsonStr = decodeUtf8Base64Url(b64Payload);
      const actualChecksum = (await sha256Hex(jsonStr)).slice(0, 16);
      if (actualChecksum !== expectedChecksum) {
        return { valid: false, error: 'Контрольная сумма токена не совпадает (данные обрезаны или повреждены)' };
      }
    } else if (trimmed.startsWith('HD_SYNC_')) {
      // Обратная совместимость со старыми токенами прототипа HD_SYNC_<base64>
      const rawB64 = trimmed.replace(/^HD_SYNC_(?:v\d+_)?/, '');
      jsonStr = decodeUtf8Base64Url(rawB64);
    }

    const parsedRaw = JSON.parse(jsonStr) as Record<string, unknown>;
    const { state: incomingState } = migrateAndHealRawPayload(parsedRaw);
    const diff = computeStateDiff(currentState, incomingState);

    return {
      valid: true,
      diff,
      parsedState: incomingState,
      ...(typeof parsedRaw['exportedAt'] === 'string' ? { exportedAt: parsedRaw['exportedAt'] } : {})
    };
  } catch {
    return { valid: false, error: 'Не удалось распознать токен или JSON резервной копии' };
  }
}

export const outboxManager = new OutboxSyncManager();
