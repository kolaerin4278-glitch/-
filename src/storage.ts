import type { AppState, Habit, Check, DayLog, Ritual } from './types';
import { STORAGE_KEY, DAY_BOUNDARY_HOUR } from './constants';
import { generateId } from './utils';
import { telegram } from './telegram';

const CLOUD_SETTINGS_KEY = 'hd_settings_v1';

function createDefaultState(): AppState {
  return {
    habits: [],
    checks: new Map(),
    logs: new Map(),
    rituals: [],
    settings: {
      dayBoundaryHour: DAY_BOUNDARY_HOUR,
      haptic: true,
      notifications: true
    }
  };
}

class Storage {
  private state: AppState = createDefaultState();
  private listeners = new Set<(state: AppState) => void>();

  constructor() {
    this.loadState();
    void this.syncSettingsFromCloud();
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  private loadState(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as {
        habits?: Habit[];
        checks?: Record<string, Check>;
        logs?: Record<string, DayLog>;
        rituals?: Ritual[];
        settings?: Partial<AppState['settings']>;
      };

      if (parsed.checks) {
        this.state.checks = new Map(Object.entries(parsed.checks));
      }
      if (parsed.logs) {
        this.state.logs = new Map(Object.entries(parsed.logs));
      }
      if (Array.isArray(parsed.habits)) {
        this.state.habits = parsed.habits;
      }
      if (Array.isArray(parsed.rituals)) {
        this.state.rituals = parsed.rituals;
      }
      if (parsed.settings) {
        this.state.settings = { ...this.state.settings, ...parsed.settings };
      }
    } catch {
      this.state = createDefaultState();
    }
  }

  private async syncSettingsFromCloud(): Promise<void> {
    if (!telegram.isAvailable()) return;
    const raw = await telegram.cloudStorageGet(CLOUD_SETTINGS_KEY);
    if (!raw) return;
    try {
      const cloudSettings = JSON.parse(raw) as Partial<AppState['settings']>;
      this.state.settings = { ...this.state.settings, ...cloudSettings };
      this.saveState();
      this.notify();
    } catch {
      // ignore invalid cloud payload
    }
  }

  saveState(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const toSave = {
        version: 1,
        habits: this.state.habits,
        checks: Object.fromEntries(this.state.checks),
        logs: Object.fromEntries(this.state.logs),
        rituals: this.state.rituals,
        settings: this.state.settings
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // ignore storage quota / private mode errors
    }
  }

  addHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'sort'>): Habit {
    const now = new Date().toISOString();
    const newHabit: Habit = {
      ...habit,
      id: generateId(),
      sort: this.state.habits.length,
      createdAt: now,
      updatedAt: now
    };

    this.state.habits.push(newHabit);
    this.saveState();
    this.notify();

    return newHabit;
  }

  updateHabit(id: string, updates: Partial<Habit>): void {
    const index = this.state.habits.findIndex(h => h.id === id);
    if (index === -1) return;

    const existing = this.state.habits[index];
    if (!existing) return;

    this.state.habits[index] = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveState();
    this.notify();
  }

  deleteHabit(id: string): void {
    this.state.habits = this.state.habits.filter(h => h.id !== id);
    this.saveState();
    this.notify();
  }

  getHabits(): Habit[] {
    return this.state.habits.filter(h => !h.deletedAt && !h.archivedAt);
  }

  setCheck(habitId: string, date: string, check: Omit<Check, 'habitId' | 'date'>): void {
    const key = `${habitId}_${date}`;
    this.state.checks.set(key, {
      habitId,
      date,
      ...check
    });

    this.saveState();
    this.notify();
  }

  clearCheck(habitId: string, date: string): void {
    const key = `${habitId}_${date}`;
    this.state.checks.delete(key);
    this.saveState();
    this.notify();
  }

  getCheck(habitId: string, date: string): Check | undefined {
    return this.state.checks.get(`${habitId}_${date}`);
  }

  setDayLog(date: string, log: DayLog): void {
    this.state.logs.set(date, log);
    this.saveState();
    this.notify();
  }

  getDayLog(date: string): DayLog | undefined {
    return this.state.logs.get(date);
  }

  addRitual(ritual: Omit<Ritual, 'id' | 'createdAt' | 'updatedAt'>): Ritual {
    const now = new Date().toISOString();
    const newRitual: Ritual = {
      ...ritual,
      id: generateId(),
      createdAt: now,
      updatedAt: now
    };

    this.state.rituals.push(newRitual);
    this.saveState();
    this.notify();

    return newRitual;
  }

  deleteRitual(id: string): void {
    this.state.rituals = this.state.rituals.filter(r => r.id !== id);
    this.saveState();
    this.notify();
  }

  getRituals(): Ritual[] {
    return this.state.rituals;
  }

  updateSettings(updates: Partial<AppState['settings']>): void {
    this.state.settings = { ...this.state.settings, ...updates };
    this.saveState();
    void telegram.cloudStorageSet(CLOUD_SETTINGS_KEY, JSON.stringify(this.state.settings));
    this.notify();
  }

  exportJSON(): string {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        habits: this.state.habits,
        checks: Object.fromEntries(this.state.checks),
        logs: Object.fromEntries(this.state.logs),
        rituals: this.state.rituals,
        settings: this.state.settings
      },
      null,
      2
    );
  }

  importJSON(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as {
        habits?: Habit[];
        checks?: Record<string, Check>;
        logs?: Record<string, DayLog>;
        rituals?: Ritual[];
        settings?: Partial<AppState['settings']>;
      };
      if (!Array.isArray(parsed.habits)) return false;

      this.state = {
        habits: parsed.habits,
        checks: new Map(Object.entries(parsed.checks ?? {})),
        logs: new Map(Object.entries(parsed.logs ?? {})),
        rituals: Array.isArray(parsed.rituals) ? parsed.rituals : [],
        settings: { ...createDefaultState().settings, ...(parsed.settings ?? {}) }
      };
      this.saveState();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  clearAll(): void {
    this.state = createDefaultState();
    this.saveState();
    this.notify();
  }
}

export const storage = new Storage();
