import { DB_NAME_PROD, DB_NAME_TEST, DB_SCHEMA_VERSION } from '../constants';
import { QuotaExceededStorageError, StorageError } from '../core/errors';
import { logger } from '../core/logger';
import type {
  Check,
  DayLog,
  GraduatedHabitRecord,
  Habit,
  OutboxOperation,
  Ritual,
  SnapshotRecord,
  WeeklyReflection
} from '../core/types';

export type StoreName =
  | 'habits'
  | 'checks'
  | 'day_logs'
  | 'rituals'
  | 'graduated'
  | 'reflections'
  | 'outbox'
  | 'snapshots'
  | 'meta';

export interface StoredCheckRow extends Check {
  readonly key: string;
}

export interface StorageEstimateInfo {
  readonly usageBytes: number;
  readonly quotaBytes: number;
  readonly usagePct: number;
}

export class IndexedDBEngine {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly dbName: string;
  private readonly memoryFallback = new Map<StoreName, Map<string, unknown>>();

  constructor(isTestEnv = false) {
    this.dbName = isTestEnv ? DB_NAME_TEST : DB_NAME_PROD;
    const stores: StoreName[] = [
      'habits',
      'checks',
      'day_logs',
      'rituals',
      'graduated',
      'reflections',
      'outbox',
      'snapshots',
      'meta'
    ];
    for (const s of stores) {
      this.memoryFallback.set(s, new Map());
    }
  }

  open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, DB_SCHEMA_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains('habits')) {
            const habitStore = db.createObjectStore('habits', { keyPath: 'id' });
            habitStore.createIndex('by_sphere', 'sphere', { unique: false });
            habitStore.createIndex('by_sort', 'sort', { unique: false });
          }

          if (!db.objectStoreNames.contains('checks')) {
            const checkStore = db.createObjectStore('checks', { keyPath: 'key' });
            checkStore.createIndex('by_date', 'date', { unique: false });
            checkStore.createIndex('by_habit', 'habitId', { unique: false });
          }

          if (!db.objectStoreNames.contains('day_logs')) {
            db.createObjectStore('day_logs', { keyPath: 'date' });
          }

          if (!db.objectStoreNames.contains('rituals')) {
            db.createObjectStore('rituals', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('graduated')) {
            db.createObjectStore('graduated', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('reflections')) {
            db.createObjectStore('reflections', { keyPath: 'weekKey' });
          }

          if (!db.objectStoreNames.contains('outbox')) {
            const outboxStore = db.createObjectStore('outbox', { keyPath: 'opId' });
            outboxStore.createIndex('by_status', 'status', { unique: false });
          } else {
            const outboxStore = request.transaction?.objectStore('outbox');
            if (outboxStore && !outboxStore.indexNames.contains('by_status')) {
              outboxStore.createIndex('by_status', 'status', { unique: false });
            }
          }

          if (!db.objectStoreNames.contains('snapshots')) {
            db.createObjectStore('snapshots', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          logger.warn('IDB_OPEN_FALLBACK', 'IndexedDB недоступен, используется резервный слой в памяти');
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  async put<T extends object>(storeName: StoreName, key: string, value: T): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.memoryFallback.get(storeName)?.set(key, value);
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          const err = tx.error;
          if (err?.name === 'QuotaExceededError') {
            reject(new QuotaExceededStorageError());
          } else {
            reject(new StorageError(`Ошибка записи в хранилище ${storeName}`));
          }
        };
      } catch (err) {
        reject(new StorageError(err instanceof Error ? err.message : 'IDB put failed'));
      }
    });
  }

  async delete(storeName: StoreName, key: string): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.memoryFallback.get(storeName)?.delete(key);
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new StorageError(`Ошибка удаления из ${storeName}`));
    });
  }

  async getAll<T>(storeName: StoreName): Promise<T[]> {
    const db = await this.open();
    if (!db) {
      return Array.from(this.memoryFallback.get(storeName)?.values() ?? []) as T[];
    }

    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(new StorageError(`Ошибка чтения ${storeName}`));
    });
  }

  async getChecksInDateRange(startDateKey: string, endDateKey: string): Promise<Check[]> {
    const db = await this.open();
    if (!db || typeof IDBKeyRange === 'undefined') {
      const all = await this.getAll<StoredCheckRow>('checks');
      return all.filter((c) => c.date >= startDateKey && c.date <= endDateKey);
    }

    return new Promise<Check[]>((resolve, reject) => {
      const tx = db.transaction('checks', 'readonly');
      const idx = tx.objectStore('checks').index('by_date');
      const range = IDBKeyRange.bound(startDateKey, endDateKey);
      const results: Check[] = [];
      const cursorReq = idx.openCursor(range);

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          results.push(cursor.value as Check);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => reject(new StorageError('Ошибка выборки диапазона дат'));
    });
  }

  async persistFullSnapshot(payload: {
    habits: readonly Habit[];
    checks: ReadonlyMap<string, Check>;
    logs: ReadonlyMap<string, DayLog>;
    rituals: readonly Ritual[];
    graduated: readonly GraduatedHabitRecord[];
    reflections: readonly WeeklyReflection[];
    settings: unknown;
  }): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.memoryFallback.set('habits', new Map(payload.habits.map((h) => [h.id, h])));
      const checkMap = new Map<string, unknown>();
      payload.checks.forEach((c, k) => checkMap.set(k, { ...c, key: k }));
      this.memoryFallback.set('checks', checkMap);
      const logMap = new Map<string, unknown>();
      payload.logs.forEach((l, k) => logMap.set(k, l));
      this.memoryFallback.set('day_logs', logMap);
      this.memoryFallback.set('rituals', new Map(payload.rituals.map((r) => [r.id, r])));
      this.memoryFallback.set('graduated', new Map(payload.graduated.map((g) => [g.id, g])));
      this.memoryFallback.set('reflections', new Map(payload.reflections.map((w) => [w.weekKey, w])));
      this.memoryFallback.get('meta')?.set('settings', { key: 'settings', value: payload.settings });
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(
          ['habits', 'checks', 'day_logs', 'rituals', 'graduated', 'reflections', 'meta'],
          'readwrite'
        );

        const habitStore = tx.objectStore('habits');
        habitStore.clear();
        for (const h of payload.habits) habitStore.put(h);

        const checkStore = tx.objectStore('checks');
        checkStore.clear();
        payload.checks.forEach((c, key) => {
          checkStore.put({ ...c, key });
        });

        const logStore = tx.objectStore('day_logs');
        logStore.clear();
        payload.logs.forEach((l) => {
          logStore.put(l);
        });

        const ritualStore = tx.objectStore('rituals');
        ritualStore.clear();
        for (const r of payload.rituals) ritualStore.put(r);

        const gradStore = tx.objectStore('graduated');
        gradStore.clear();
        for (const g of payload.graduated) gradStore.put(g);

        const refStore = tx.objectStore('reflections');
        refStore.clear();
        for (const w of payload.reflections) refStore.put(w);

        tx.objectStore('meta').put({
          key: 'settings',
          value: payload.settings,
          schemaVersion: DB_SCHEMA_VERSION,
          savedAt: Date.now()
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          if (tx.error?.name === 'QuotaExceededError') {
            reject(new QuotaExceededStorageError());
          } else {
            reject(new StorageError('Не удалось сохранить транзакцию состояния в IndexedDB'));
          }
        };
      } catch (err) {
        reject(new StorageError(err instanceof Error ? err.message : 'IDB transaction failed'));
      }
    });
  }

  async loadAllEntities(): Promise<{
    habits: Habit[];
    checks: StoredCheckRow[];
    logs: DayLog[];
    rituals: Ritual[];
    graduated: GraduatedHabitRecord[];
    reflections: WeeklyReflection[];
    outbox: OutboxOperation[];
    snapshots: SnapshotRecord[];
    settingsRaw: unknown;
  }> {
    const [habits, checks, logs, rituals, graduated, reflections, outbox, snapshots, metaRows] =
      await Promise.all([
        this.getAll<Habit>('habits'),
        this.getAll<StoredCheckRow>('checks'),
        this.getAll<DayLog>('day_logs'),
        this.getAll<Ritual>('rituals'),
        this.getAll<GraduatedHabitRecord>('graduated'),
        this.getAll<WeeklyReflection>('reflections'),
        this.getAll<OutboxOperation>('outbox'),
        this.getAll<SnapshotRecord>('snapshots'),
        this.getAll<{ key: string; value: unknown }>('meta')
      ]);

    const settingsEntry = metaRows.find((m) => m.key === 'settings');
    return {
      habits,
      checks,
      logs,
      rituals,
      graduated,
      reflections,
      outbox,
      snapshots,
      settingsRaw: settingsEntry?.value
    };
  }

  async clearAllStores(): Promise<void> {
    for (const m of this.memoryFallback.values()) m.clear();
    const db = await this.open();
    if (!db) return;

    const stores: StoreName[] = [
      'habits',
      'checks',
      'day_logs',
      'rituals',
      'graduated',
      'reflections',
      'outbox',
      'snapshots',
      'meta'
    ];
    return new Promise<void>((resolve) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const s of stores) {
        tx.objectStore(s).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async estimateStorageUsage(): Promise<StorageEstimateInfo> {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usage = est.usage ?? 0;
        const quota = est.quota ?? 50 * 1024 * 1024;
        return {
          usageBytes: usage,
          quotaBytes: quota,
          usagePct: quota > 0 ? Math.round((usage / quota) * 1000) / 10 : 0
        };
      } catch {
        // ignore
      }
    }
    return { usageBytes: 0, quotaBytes: 50 * 1024 * 1024, usagePct: 0 };
  }
}

export const idbEngine = new IndexedDBEngine();
