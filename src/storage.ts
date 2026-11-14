import {
  CLOUD_SETTINGS_KEY,
  LEGACY_STORAGE_KEYS,
  MAX_IMPORT_BYTES,
  SHIELD_REWARD_STREAK_DAYS,
  STORAGE_KEY,
  STATUS,
  TRASH_RETENTION_DAYS
} from './constants';
import { eventBus } from './core/event-bus';
import {
  cloneValue,
  createDefaultAppState,
  createHabitEntity,
  createRitualEntity,
  type CreateHabitInput,
  type CreateRitualInput
} from './core/factory';
import { createEntityId, createOperationId, getOrCreateDeviceId } from './core/id';
import { lifecycle } from './core/lifecycle';
import { logger } from './core/logger';
import { safeMode } from './core/safe-mode';
import type {
  AppState,
  Check,
  DayLog,
  GraduatedHabitRecord,
  Habit,
  Ritual,
  SnapshotRecord,
  UserSettings,
  WeeklyReflection
} from './core/types';
import { getTodayKey } from './date';
import { idbEngine, type StorageEstimateInfo } from './storage/indexedDb';
import { migrateAndHealRawPayload, serializeAppState } from './storage/migrations';
import {
  generatePortableSyncToken,
  mergeAppStatesLWW,
  outboxManager,
  previewPortableSyncToken,
  type SyncTokenPreview
} from './storage/outbox';
import { snapshotManager } from './storage/snapshots';
import { appStore } from './store';
import { computeStreak } from './streak';
import { telegram } from './telegram';

type IdleScheduler = (cb: () => void, opts?: { timeout: number }) => number;

class StorageFacade {
  private persistScheduled = false;
  private preImportRollbackState: AppState | null = null;
  private initializedPromise: Promise<void>;

  constructor() {
    this.loadSynchronousLocalMirror();
    this.initializedPromise = this.hydrateFromIndexedDB();
    void this.syncSettingsFromCloud();

    lifecycle.bind();
    lifecycle.onFlush(() => {
      this.saveLocalMirrorSync();
      void this.flushToIndexedDBImmediate();
      outboxManager.flushWithBeacon();
    });

    eventBus.on('sync:status', ({ status, pending }) => {
      const cur = appStore.getState();
      cur.syncStatus = status;
      cur.pendingOutboxCount = pending;
    });
  }

  whenReady(): Promise<void> {
    return this.initializedPromise;
  }

  getState(): AppState {
    return appStore.getState();
  }

  subscribe(listener: (state: AppState) => void, signal?: AbortSignal): () => void {
    return appStore.subscribe(listener, signal);
  }

  undo(): string | null {
    const label = appStore.undo();
    if (label) {
      this.schedulePersist();
    }
    return label;
  }

  redo(): string | null {
    const label = appStore.redo();
    if (label) {
      this.schedulePersist();
    }
    return label;
  }

  canUndo(): boolean {
    return appStore.canUndo();
  }

  private loadSynchronousLocalMirror(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      let rawJson = localStorage.getItem(STORAGE_KEY);
      if (!rawJson) {
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          const candidate = localStorage.getItem(legacyKey);
          if (candidate) {
            rawJson = candidate;
            break;
          }
        }
      }
      if (!rawJson) return;

      const parsed = JSON.parse(rawJson) as unknown;
      const { state, warnings } = migrateAndHealRawPayload(parsed);
      if (warnings.length > 0) {
        logger.warn('STORAGE_MIGRATION_WARNINGS', warnings.join('; '));
      }
      this.purgeExpiredTrashInPlace(state);
      appStore.replaceState(state, 'local-boot', false);
    } catch (err) {
      logger.error('LOCAL_MIRROR_CORRUPT', err);
      safeMode.activate('Повреждена локальная запись состояния', {
        onExportEmergencyRaw: () => this.downloadEmergencyRaw(),
        onRestoreLatestSnapshot: () => this.restoreLatestSnapshot(),
        onResetCleanDatabase: async () => {
          this.clearAll();
        }
      });
    }
  }

  private async hydrateFromIndexedDB(): Promise<void> {
    try {
      const loaded = await idbEngine.loadAllEntities();
      await outboxManager.hydrate(loaded.outbox);

      const hasIdbData =
        loaded.habits.length > 0 ||
        loaded.checks.length > 0 ||
        loaded.logs.length > 0 ||
        loaded.rituals.length > 0 ||
        loaded.settingsRaw !== undefined;

      if (hasIdbData) {
        const checksObj: Record<string, Check> = {};
        for (const c of loaded.checks) {
          checksObj[c.key] = c;
        }
        const logsObj: Record<string, DayLog> = {};
        for (const l of loaded.logs) {
          logsObj[l.date] = l;
        }
        const { state: idbState } = migrateAndHealRawPayload({
          habits: loaded.habits,
          checks: checksObj,
          logs: logsObj,
          rituals: loaded.rituals,
          graduated: loaded.graduated,
          reflections: loaded.reflections,
          settings: loaded.settingsRaw
        });

        const merged = mergeAppStatesLWW(appStore.getState(), idbState);
        this.purgeExpiredTrashInPlace(merged);
        appStore.replaceState(merged, 'idb-hydrate', true);
      } else if (appStore.getState().habits.length > 0) {
        // Первичная миграция из localStorage -> IndexedDB
        await this.flushToIndexedDBImmediate();
        await snapshotManager.createSnapshot(appStore.getState(), 'daily');
      }
    } catch (err) {
      logger.error('IDB_HYDRATE_ERROR', err);
    }
  }

  private purgeExpiredTrashInPlace(state: AppState): void {
    const retentionDays = state.settings?.trashRetentionDays ?? TRASH_RETENTION_DAYS;
    const cutoffMs = Date.now() - retentionDays * 86_400_000;
    state.habits = state.habits.filter((h) => {
      if (!h.deletedAt) return true;
      const deletedMs = Date.parse(h.deletedAt);
      return Number.isNaN(deletedMs) || deletedMs >= cutoffMs;
    });
  }

  private async syncSettingsFromCloud(): Promise<void> {
    if (!telegram.isAvailable()) return;
    const raw = await telegram.cloudStorageGet(CLOUD_SETTINGS_KEY);
    if (!raw) return;
    try {
      const cloudSettings = JSON.parse(raw) as Partial<UserSettings>;
      const cur = appStore.getState();
      appStore.replaceState(
        {
          ...cur,
          settings: { ...cur.settings, ...cloudSettings }
        },
        'cloud-settings',
        true
      );
      this.saveLocalMirrorSync();
    } catch {
      // ignore invalid cloud payload
    }
  }

  saveState(): void {
    this.schedulePersist();
  }

  private saveLocalMirrorSync(): void {
    if (safeMode.isActive()) return;
    try {
      if (typeof localStorage === 'undefined') return;
      const serialized = serializeAppState(appStore.getState());
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (err) {
      logger.warn('LOCAL_MIRROR_QUOTA', err instanceof Error ? err.message : 'Quota exceeded');
    }
  }

  private async flushToIndexedDBImmediate(): Promise<void> {
    if (safeMode.isActive()) return;
    const s = appStore.getState();
    try {
      await idbEngine.persistFullSnapshot({
        habits: s.habits,
        checks: s.checks,
        logs: s.logs,
        rituals: s.rituals,
        graduated: s.graduated,
        reflections: s.reflections,
        settings: s.settings
      });
    } catch (err) {
      logger.error('IDB_FLUSH_FAILED', err);
    }
  }

  private schedulePersist(): void {
    this.saveLocalMirrorSync();
    if (this.persistScheduled) return;
    this.persistScheduled = true;

    const run = (): void => {
      this.persistScheduled = false;
      void this.flushToIndexedDBImmediate();
    };

    const win = typeof window !== 'undefined' ? (window as Window & { requestIdleCallback?: IdleScheduler }) : null;
    if (win?.requestIdleCallback) {
      win.requestIdleCallback(run, { timeout: 1200 });
    } else {
      setTimeout(run, 120);
    }
  }

  /* ==================== HABITS CRUD, ARCHIVE, TRASH & ORDER ==================== */

  addHabit(input: CreateHabitInput): Habit {
    const created = appStore.dispatch<Habit>({
      type: 'habit/add',
      undoable: true,
      label: 'Добавление привычки',
      execute: (state) => {
        const activeCount = state.habits.filter((h) => !h.deletedAt).length;
        const entity = createHabitEntity(input, activeCount);
        const nextHabits = [...state.habits, entity];
        return {
          nextState: { ...state, habits: nextHabits },
          result: entity,
          inverse: (s) => ({ ...s, habits: s.habits.filter((h) => h.id !== entity.id) })
        };
      }
    });

    this.schedulePersist();
    void outboxManager.enqueue('habit', created.id, 'upsert', created, 1);
    appStore.flushSubscribers();
    return created;
  }

  updateHabit(id: string, updates: Partial<Habit>): void {
    let updatedEntity: Habit | null = null;

    appStore.dispatch<void>({
      type: 'habit/update',
      undoable: true,
      label: 'Изменение привычки',
      execute: (state) => {
        const idx = state.habits.findIndex((h) => h.id === id);
        if (idx === -1) return { nextState: state, result: undefined };
        const prevHabit = state.habits[idx]!;
        const nextHabit: Habit = {
          ...prevHabit,
          ...updates,
          id: prevHabit.id,
          version: (prevHabit.version ?? 1) + 1,
          updatedAt: new Date().toISOString()
        };
        updatedEntity = nextHabit;
        const nextHabits = [...state.habits];
        nextHabits[idx] = nextHabit;

        return {
          nextState: { ...state, habits: nextHabits },
          result: undefined,
          inverse: (s) => ({
            ...s,
            habits: s.habits.map((h) => (h.id === id ? prevHabit : h))
          })
        };
      }
    });

    this.schedulePersist();
    if (updatedEntity) {
      void outboxManager.enqueue('habit', id, 'upsert', updatedEntity, 1);
    }
    appStore.flushSubscribers();
  }

  duplicateHabit(id: string): Habit | null {
    const source = appStore.getState().habits.find((h) => h.id === id);
    if (!source) return null;
    return this.addHabit({
      title: `${source.title} (копия)`.slice(0, 100),
      icon: source.icon,
      sphere: source.sphere,
      type: source.type,
      trigger: source.trigger,
      ...(source.contextLocation ? { contextLocation: source.contextLocation } : {}),
      norm: source.norm,
      planB: source.planB,
      ...(source.targetValue !== undefined ? { targetValue: source.targetValue } : {}),
      ...(source.unit !== undefined ? { unit: source.unit } : {}),
      ...(source.stepValue !== undefined ? { stepValue: source.stepValue } : {}),
      ...(source.timerMinutes !== undefined ? { timerMinutes: source.timerMinutes } : {}),
      ...(source.energyCost !== undefined ? { energyCost: source.energyCost } : {}),
      ...(source.schedule !== undefined ? { schedule: cloneValue(source.schedule) } : {}),
      ...(source.masteryTargetDays !== undefined ? { masteryTargetDays: source.masteryTargetDays } : {}),
      ...(source.microPlanB !== undefined ? { microPlanB: source.microPlanB } : {}),
      ...(source.description !== undefined ? { description: source.description } : {}),
      ...(source.color !== undefined ? { color: source.color } : {}),
      ...(source.reminder !== undefined ? { reminder: cloneValue(source.reminder) } : {}),
      keystone: source.keystone,
      incognito: source.incognito,
      capsule: source.capsule
    });
  }

  archiveHabit(id: string, archived = true): void {
    if (archived) {
      this.updateHabit(id, { archivedAt: new Date().toISOString() });
    } else {
      appStore.dispatch<void>({
        type: 'habit/unarchive',
        undoable: true,
        label: 'Возврат из архива',
        execute: (state) => {
          const prev = state.habits.find((h) => h.id === id);
          if (!prev) return { nextState: state, result: undefined };
          const { archivedAt: _omit, ...rest } = prev;
          const restored: Habit = { ...rest, updatedAt: new Date().toISOString() };
          return {
            nextState: {
              ...state,
              habits: state.habits.map((h) => (h.id === id ? restored : h))
            },
            result: undefined,
            inverse: (s) => ({
              ...s,
              habits: s.habits.map((h) => (h.id === id ? prev : h))
            })
          };
        }
      });
      this.schedulePersist();
      appStore.flushSubscribers();
    }
  }

  deleteHabit(id: string, hardDelete = false): void {
    if (!hardDelete) {
      // Мягкое удаление в корзину (План 03 п. 848, План 07 п. 850)
      this.updateHabit(id, { deletedAt: new Date().toISOString() });
      return;
    }

    appStore.dispatch<void>({
      type: 'habit/hard-delete',
      undoable: true,
      label: 'Удаление привычки навсегда',
      execute: (state) => {
        const removed = state.habits.find((h) => h.id === id);
        if (!removed) return { nextState: state, result: undefined };
        return {
          nextState: { ...state, habits: state.habits.filter((h) => h.id !== id) },
          result: undefined,
          inverse: (s) => ({ ...s, habits: [...s.habits, removed].sort((a, b) => a.sort - b.sort) })
        };
      }
    });
    this.schedulePersist();
    void outboxManager.enqueue('habit', id, 'delete', { id }, 1);
    appStore.flushSubscribers();
  }

  restoreHabitFromTrash(id: string): void {
    appStore.dispatch<void>({
      type: 'habit/restore-trash',
      undoable: true,
      label: 'Восстановление из корзины',
      execute: (state) => {
        const prev = state.habits.find((h) => h.id === id);
        if (!prev) return { nextState: state, result: undefined };
        const { deletedAt: _d, archivedAt: _a, ...rest } = prev;
        const clean: Habit = { ...rest, updatedAt: new Date().toISOString() };
        return {
          nextState: {
            ...state,
            habits: state.habits.map((h) => (h.id === id ? clean : h))
          },
          result: undefined,
          inverse: (s) => ({
            ...s,
            habits: s.habits.map((h) => (h.id === id ? prev : h))
          })
        };
      }
    });
    this.schedulePersist();
    appStore.flushSubscribers();
  }

  reorderHabits(orderedIds: readonly string[]): void {
    appStore.dispatch<void>({
      type: 'habit/reorder',
      undoable: true,
      label: 'Изменение порядка привычек',
      execute: (state) => {
        const prevHabits = state.habits;
        const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
        const nextHabits = state.habits
          .map((h) => {
            const newSort = orderMap.get(h.id);
            return newSort !== undefined ? { ...h, sort: newSort, updatedAt: new Date().toISOString() } : h;
          })
          .sort((a, b) => a.sort - b.sort);
        return {
          nextState: { ...state, habits: nextHabits },
          result: undefined,
          inverse: (s) => ({ ...s, habits: prevHabits })
        };
      }
    });
    this.schedulePersist();
    appStore.flushSubscribers();
  }

  getHabits(): Habit[] {
    return appStore
      .getState()
      .habits.filter((h) => !h.deletedAt && !h.archivedAt)
      .sort((a, b) => a.sort - b.sort);
  }

  getArchivedHabits(): Habit[] {
    return appStore.getState().habits.filter((h) => !h.deletedAt && Boolean(h.archivedAt));
  }

  getDeletedHabits(): Habit[] {
    return appStore.getState().habits.filter((h) => Boolean(h.deletedAt));
  }

  graduateHabit(habitId: string): GraduatedHabitRecord | null {
    const state = appStore.getState();
    const habit = state.habits.find((h) => h.id === habitId);
    if (!habit) return null;

    let completedDays = 0;
    state.checks.forEach((c) => {
      if (c.habitId === habitId && (c.status === STATUS.FULL || c.status === STATUS.PLAN_B)) {
        completedDays++;
      }
    });

    const record: GraduatedHabitRecord = {
      id: createEntityId('grad'),
      habitId: habit.id,
      title: habit.title,
      icon: habit.icon,
      sphere: habit.sphere,
      completedDays,
      graduatedAt: new Date().toISOString()
    };

    appStore.dispatch<void>({
      type: 'habit/graduate',
      undoable: true,
      label: 'Выпуск привычки в Зал мастерства',
      execute: (s) => ({
        nextState: {
          ...s,
          graduated: [record, ...s.graduated],
          habits: s.habits.map((h) =>
            h.id === habitId
              ? { ...h, graduatedAt: record.graduatedAt, archivedAt: record.graduatedAt }
              : h
          )
        },
        result: undefined,
        inverse: (invS) => ({
          ...invS,
          graduated: invS.graduated.filter((g) => g.id !== record.id),
          habits: invS.habits.map((h) => (h.id === habitId ? habit : h))
        })
      })
    });

    this.schedulePersist();
    void outboxManager.enqueue('graduated', record.id, 'upsert', record, 1);
    appStore.flushSubscribers();
    return record;
  }

  /* ==================== CHECK-INS, COUNTERS, DAY LOGS & SHIELDS ==================== */

  setCheck(habitId: string, date: string, check: Omit<Check, 'habitId' | 'date'>): void {
    const key = `${habitId}_${date}`;
    const fullCheck: Check = {
      habitId,
      date,
      ...check,
      opId: check.opId ?? createOperationId(),
      deviceId: check.deviceId ?? getOrCreateDeviceId()
    };

    appStore.dispatch<void>({
      type: 'check/set',
      undoable: true,
      label: 'Отметка привычки',
      execute: (state) => {
        const prevCheck = state.checks.get(key);
        const nextChecks = new Map(state.checks);
        nextChecks.set(key, fullCheck);

        // Автоматическое начисление щита за каждые 14 дней новой серии
        let nextSettings = state.settings;
        const habit = state.habits.find((h) => h.id === habitId);
        if (
          habit &&
          !prevCheck &&
          (fullCheck.status === STATUS.FULL || fullCheck.status === STATUS.PLAN_B)
        ) {
          const streak = computeStreak(habit, nextChecks, state.logs, date);
          if (streak > 0 && streak % SHIELD_REWARD_STREAK_DAYS === 0) {
            nextSettings = { ...state.settings, shields: Math.min(99, state.settings.shields + 1) };
            eventBus.emit('shield:rewarded', {
              habitTitle: habit.title,
              totalShields: nextSettings.shields
            });
          }
        }

        return {
          nextState: { ...state, checks: nextChecks, settings: nextSettings },
          result: undefined,
          inverse: (s) => {
            const reverted = new Map(s.checks);
            if (prevCheck) reverted.set(key, prevCheck);
            else reverted.delete(key);
            return { ...s, checks: reverted, settings: state.settings };
          }
        };
      }
    });

    this.schedulePersist();
    void outboxManager.enqueue('check', key, 'upsert', fullCheck, 2);
    appStore.flushSubscribers();
  }

  adjustCounter(habitId: string, date: string, delta: number): Check | null {
    const habit = appStore.getState().habits.find((h) => h.id === habitId);
    if (!habit) return null;

    const target = habit.targetValue ?? 8;
    const current = this.getCheck(habitId, date);
    const prevVal = current?.value ?? 0;
    const nextVal = Math.max(0, Math.min(100_000, Math.round((prevVal + delta) * 100) / 100));

    if (nextVal === 0) {
      this.clearCheck(habitId, date);
      return null;
    }

    const planBThreshold = Math.max(1, Math.ceil(target / 2));
    const status =
      nextVal >= target
        ? STATUS.FULL
        : nextVal >= planBThreshold
          ? STATUS.PLAN_B
          : STATUS.COUNTER;

    this.setCheck(habitId, date, {
      status,
      value: nextVal,
      ts: Date.now()
    });

    return this.getCheck(habitId, date) ?? null;
  }

  clearCheck(habitId: string, date: string): void {
    const key = `${habitId}_${date}`;
    appStore.dispatch<void>({
      type: 'check/clear',
      undoable: true,
      label: 'Снятие отметки',
      execute: (state) => {
        const prev = state.checks.get(key);
        if (!prev) return { nextState: state, result: undefined };
        const nextChecks = new Map(state.checks);
        nextChecks.delete(key);
        return {
          nextState: { ...state, checks: nextChecks },
          result: undefined,
          inverse: (s) => {
            const restored = new Map(s.checks);
            restored.set(key, prev);
            return { ...s, checks: restored };
          }
        };
      }
    });

    this.schedulePersist();
    void outboxManager.enqueue('check', key, 'delete', { habitId, date }, 2);
    appStore.flushSubscribers();
  }

  getCheck(habitId: string, date: string): Check | undefined {
    return appStore.getState().checks.get(`${habitId}_${date}`);
  }

  setDayLog(date: string, log: DayLog): void {
    const stamped: DayLog = { ...log, date, updatedAt: Date.now() };
    appStore.dispatch<void>({
      type: 'dayLog/set',
      undoable: true,
      label: 'Обновление дневника дня',
      execute: (state) => {
        const prev = state.logs.get(date);
        const nextLogs = new Map(state.logs);
        nextLogs.set(date, stamped);
        return {
          nextState: { ...state, logs: nextLogs },
          result: undefined,
          inverse: (s) => {
            const reverted = new Map(s.logs);
            if (prev) reverted.set(date, prev);
            else reverted.delete(date);
            return { ...s, logs: reverted };
          }
        };
      }
    });

    this.schedulePersist();
    void outboxManager.enqueue('day_log', date, 'upsert', stamped, 2);
    appStore.flushSubscribers();
  }

  getDayLog(date: string): DayLog | undefined {
    return appStore.getState().logs.get(date);
  }

  /**
   * Идемпотентная активация щита на дату (План 06 пп. 736–739):
   * - нельзя активировать на будущую дату;
   * - нельзя сжечь два щита за один и тот же день;
   * - проверяется баланс state.settings.shields > 0.
   */
  activateShieldForDate(date: string): { ok: boolean; reason?: string; remainingShields: number } {
    const state = appStore.getState();
    const todayKey = getTodayKey(state.settings.dayBoundaryHour);

    if (date > todayKey) {
      return {
        ok: false,
        reason: 'Щит нельзя активировать на будущую дату',
        remainingShields: state.settings.shields
      };
    }

    const existingLog = state.logs.get(date);
    if (existingLog?.shielded) {
      return {
        ok: true,
        reason: 'Этот день уже защищён щитом',
        remainingShields: state.settings.shields
      };
    }

    if (state.settings.shields <= 0) {
      return {
        ok: false,
        reason: 'Нет доступных щитов (новый начисляется каждые 14 дней серии)',
        remainingShields: 0
      };
    }

    const nextShields = state.settings.shields - 1;
    const nextLog: DayLog = {
      date,
      energy: existingLog?.energy ?? 0,
      ...existingLog,
      shielded: true,
      updatedAt: Date.now()
    };

    appStore.dispatch<void>({
      type: 'shield/activate',
      undoable: true,
      label: 'Активация щита серии',
      execute: (s) => {
        const nextLogs = new Map(s.logs);
        nextLogs.set(date, nextLog);
        return {
          nextState: {
            ...s,
            logs: nextLogs,
            settings: { ...s.settings, shields: nextShields }
          },
          result: undefined,
          inverse: (invS) => {
            const revLogs = new Map(invS.logs);
            if (existingLog) revLogs.set(date, existingLog);
            else revLogs.delete(date);
            return {
              ...invS,
              logs: revLogs,
              settings: { ...invS.settings, shields: s.settings.shields }
            };
          }
        };
      }
    });

    this.schedulePersist();
    void outboxManager.enqueue('day_log', date, 'upsert', nextLog, 1);
    eventBus.emit('shield:activated', { date, remainingShields: nextShields });
    appStore.flushSubscribers();
    return { ok: true, remainingShields: nextShields };
  }

  setSelectedDateKey(dateKey: string): void {
    const cur = appStore.getState();
    if (cur.selectedDateKey === dateKey) return;
    appStore.replaceState({ ...cur, selectedDateKey: dateKey }, 'ui/select-date', true);
  }

  getSelectedDateKey(): string {
    const s = appStore.getState();
    return s.selectedDateKey ?? getTodayKey(s.settings.dayBoundaryHour);
  }

  /* ==================== RITUALS ==================== */

  addRitual(input: CreateRitualInput): Ritual {
    const created = appStore.dispatch<Ritual>({
      type: 'ritual/add',
      undoable: true,
      label: 'Создание ритуала',
      execute: (state) => {
        const entity = createRitualEntity(input);
        return {
          nextState: { ...state, rituals: [...state.rituals, entity] },
          result: entity,
          inverse: (s) => ({ ...s, rituals: s.rituals.filter((r) => r.id !== entity.id) })
        };
      }
    });

    this.schedulePersist();
    void outboxManager.enqueue('ritual', created.id, 'upsert', created, 1);
    appStore.flushSubscribers();
    return created;
  }

  updateRitual(id: string, input: CreateRitualInput): void {
    appStore.dispatch<void>({
      type: 'ritual/update',
      undoable: true,
      label: 'Редактирование ритуала',
      execute: (state) => {
        const prev = state.rituals.find((r) => r.id === id);
        if (!prev) return { nextState: state, result: undefined };
        const rebuilt = createRitualEntity(input);
        const updated: Ritual = {
          ...rebuilt,
          id: prev.id,
          createdAt: prev.createdAt,
          updatedAt: new Date().toISOString()
        };
        return {
          nextState: {
            ...state,
            rituals: state.rituals.map((r) => (r.id === id ? updated : r))
          },
          result: undefined,
          inverse: (s) => ({
            ...s,
            rituals: s.rituals.map((r) => (r.id === id ? prev : r))
          })
        };
      }
    });

    this.schedulePersist();
    appStore.flushSubscribers();
  }

  deleteRitual(id: string): void {
    appStore.dispatch<void>({
      type: 'ritual/delete',
      undoable: true,
      label: 'Удаление ритуала',
      execute: (state) => {
        const prev = state.rituals.find((r) => r.id === id);
        if (!prev) return { nextState: state, result: undefined };
        return {
          nextState: { ...state, rituals: state.rituals.filter((r) => r.id !== id) },
          result: undefined,
          inverse: (s) => ({ ...s, rituals: [...s.rituals, prev] })
        };
      }
    });

    this.schedulePersist();
    void outboxManager.enqueue('ritual', id, 'delete', { id }, 1);
    appStore.flushSubscribers();
  }

  getRituals(): Ritual[] {
    return appStore.getState().rituals.filter((r) => !r.deletedAt);
  }

  /* ==================== REFLECTIONS & SETTINGS ==================== */

  saveWeeklyReflection(reflection: WeeklyReflection): void {
    appStore.dispatch<void>({
      type: 'reflection/save',
      undoable: false,
      execute: (state) => {
        const filtered = state.reflections.filter((r) => r.weekKey !== reflection.weekKey);
        return {
          nextState: { ...state, reflections: [reflection, ...filtered] },
          result: undefined
        };
      }
    });
    this.schedulePersist();
    appStore.flushSubscribers();
  }

  updateSettings(updates: Partial<UserSettings>): void {
    appStore.dispatch<void>({
      type: 'settings/update',
      undoable: false,
      execute: (state) => ({
        nextState: {
          ...state,
          settings: { ...state.settings, ...updates }
        },
        result: undefined
      })
    });

    this.schedulePersist();
    const nextSettings = appStore.getState().settings;
    void telegram.cloudStorageSet(CLOUD_SETTINGS_KEY, JSON.stringify(nextSettings));
    void outboxManager.enqueue('settings', 'user_settings', 'upsert', nextSettings, 1);
    appStore.flushSubscribers();
  }

  /* ==================== EXPORT, IMPORT, SYNC TOKENS & SNAPSHOTS ==================== */

  exportJSON(): string {
    return JSON.stringify(JSON.parse(serializeAppState(appStore.getState())), null, 2);
  }

  async previewImport(rawOrToken: string): Promise<SyncTokenPreview> {
    const byteLength = new TextEncoder().encode(rawOrToken).byteLength;
    if (byteLength > MAX_IMPORT_BYTES) {
      return { valid: false, error: 'Размер импортируемых данных превышает безопасный лимит 5 МБ' };
    }
    return previewPortableSyncToken(rawOrToken, appStore.getState());
  }

  async applyValidatedImport(incomingState: AppState, mode: 'merge' | 'replace' = 'merge'): Promise<void> {
    const current = appStore.getState();
    this.preImportRollbackState = cloneValue({
      ...current,
      checks: new Map(current.checks),
      logs: new Map(current.logs)
    });
    await snapshotManager.createSnapshot(current, 'pre-import');

    const finalState = mode === 'merge' ? mergeAppStatesLWW(current, incomingState) : incomingState;
    appStore.replaceState(finalState, 'import/apply', true);
    this.saveLocalMirrorSync();
    await this.flushToIndexedDBImmediate();
  }

  importJSON(raw: string): boolean {
    try {
      const byteLength = new TextEncoder().encode(raw).byteLength;
      if (byteLength > MAX_IMPORT_BYTES) return false;
      const parsed = JSON.parse(raw) as unknown;
      const { state } = migrateAndHealRawPayload(parsed);
      const current = appStore.getState();
      this.preImportRollbackState = {
        ...current,
        checks: new Map(current.checks),
        logs: new Map(current.logs)
      };
      const merged = mergeAppStatesLWW(current, state);
      appStore.replaceState(merged, 'import/json', true);
      this.schedulePersist();
      return true;
    } catch (err) {
      logger.error('IMPORT_JSON_INVALID', err);
      return false;
    }
  }

  canRollbackLastImport(): boolean {
    return this.preImportRollbackState !== null;
  }

  rollbackLastImport(): boolean {
    if (!this.preImportRollbackState) return false;
    appStore.replaceState(this.preImportRollbackState, 'import/rollback', true);
    this.preImportRollbackState = null;
    this.schedulePersist();
    return true;
  }

  generateSyncToken(): Promise<string> {
    return generatePortableSyncToken(appStore.getState());
  }

  createManualSnapshot(): Promise<SnapshotRecord> {
    return snapshotManager.createSnapshot(appStore.getState(), 'rolling');
  }

  listSnapshots(): Promise<SnapshotRecord[]> {
    return snapshotManager.listSnapshots();
  }

  async restoreLatestSnapshot(snapshotId?: string): Promise<boolean> {
    const restored = await snapshotManager.restoreSnapshot(snapshotId);
    if (!restored) return false;
    appStore.replaceState(restored, 'snapshot/restore', true);
    this.saveLocalMirrorSync();
    await this.flushToIndexedDBImmediate();
    return true;
  }

  estimateStorage(): Promise<StorageEstimateInfo> {
    return idbEngine.estimateStorageUsage();
  }

  forceSyncNow(authToken?: string): Promise<boolean> {
    return outboxManager.flushBatch(authToken);
  }

  private downloadEmergencyRaw(): void {
    if (typeof document === 'undefined') return;
    const raw =
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) ||
      serializeAppState(appStore.getState());
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-diary-emergency-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  clearAll(): void {
    appStore.clearHistory();
    appStore.replaceState(createDefaultAppState(), 'storage/reset', true);
    this.preImportRollbackState = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        for (const k of LEGACY_STORAGE_KEYS) localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
    void idbEngine.clearAllStores();
    void outboxManager.clearAll();
  }
}

export const storage = new StorageFacade();
