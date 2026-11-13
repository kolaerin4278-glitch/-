import { MAX_ROLLING_SNAPSHOTS } from '../constants';
import { createEntityId } from '../core/id';
import { sha256Hex } from '../core/security';
import type { AppState, SnapshotRecord } from '../core/types';
import { IndexedDBEngine, idbEngine } from './indexedDb';
import { migrateAndHealRawPayload, serializeAppState } from './migrations';

export interface StateDiffSummary {
  readonly newHabits: number;
  readonly updatedHabits: number;
  readonly newChecks: number;
  readonly conflictingChecks: number;
  readonly newRituals: number;
}

export function computeStateDiff(current: AppState, incoming: AppState): StateDiffSummary {
  const currentHabitMap = new Map(current.habits.map((h) => [h.id, h]));
  let newHabits = 0;
  let updatedHabits = 0;

  for (const h of incoming.habits) {
    const prev = currentHabitMap.get(h.id);
    if (!prev) {
      newHabits++;
    } else if (prev.updatedAt !== h.updatedAt || prev.title !== h.title) {
      updatedHabits++;
    }
  }

  let newChecks = 0;
  let conflictingChecks = 0;
  incoming.checks.forEach((incCheck, key) => {
    const curCheck = current.checks.get(key);
    if (!curCheck) {
      newChecks++;
    } else if (curCheck.status !== incCheck.status || curCheck.value !== incCheck.value) {
      conflictingChecks++;
    }
  });

  const currentRitualIds = new Set(current.rituals.map((r) => r.id));
  let newRituals = 0;
  for (const r of incoming.rituals) {
    if (!currentRitualIds.has(r.id)) newRituals++;
  }

  return { newHabits, updatedHabits, newChecks, conflictingChecks, newRituals };
}

export class SnapshotManager {
  constructor(private readonly engine: IndexedDBEngine = idbEngine) {}

  async createSnapshot(
    state: AppState,
    kind: SnapshotRecord['kind'] = 'rolling'
  ): Promise<SnapshotRecord> {
    const serializedState = serializeAppState(state);
    const checksum = await sha256Hex(serializedState);
    const record: SnapshotRecord = {
      id: kind === 'daily' ? `daily_${new Date().toISOString().slice(0, 10)}` : createEntityId('snap'),
      kind,
      createdAt: new Date().toISOString(),
      checksum,
      serializedState,
      habitsCount: state.habits.length,
      checksCount: state.checks.size
    };

    await this.engine.put('snapshots', record.id, record);
    await this.pruneOldSnapshots();
    return record;
  }

  async listSnapshots(): Promise<SnapshotRecord[]> {
    const all = await this.engine.getAll<SnapshotRecord>('snapshots');
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async restoreSnapshot(snapshotId?: string): Promise<AppState | null> {
    const list = await this.listSnapshots();
    const target = snapshotId ? list.find((s) => s.id === snapshotId) : list[0];
    if (!target) return null;

    const computedHash = await sha256Hex(target.serializedState);
    if (computedHash !== target.checksum) {
      return null;
    }

    const raw = JSON.parse(target.serializedState) as unknown;
    const { state } = migrateAndHealRawPayload(raw);
    return state;
  }

  private async pruneOldSnapshots(): Promise<void> {
    const all = await this.listSnapshots();
    const rolling = all.filter((s) => s.kind === 'rolling');
    if (rolling.length > MAX_ROLLING_SNAPSHOTS) {
      for (const extra of rolling.slice(MAX_ROLLING_SNAPSHOTS)) {
        await this.engine.delete('snapshots', extra.id);
      }
    }

    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
    for (const snap of all) {
      if (snap.kind === 'daily' && snap.createdAt < thirtyDaysAgoIso) {
        await this.engine.delete('snapshots', snap.id);
      }
    }
  }
}

export const snapshotManager = new SnapshotManager();
