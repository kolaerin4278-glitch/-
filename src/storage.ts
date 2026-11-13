import type { AppState, Habit, Check, DayLog, Ritual } from './types';
import { STORAGE_KEY, DAY_BOUNDARY_HOUR } from './constants';
import { generateId } from './utils';

const defaultState: AppState = {
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

class Storage {
  private state: AppState = { ...defaultState };
  private listeners = new Set<(state: AppState) => void>();

  constructor() {
    this.loadState();
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

      const parsed = JSON.parse(stored);
      
      // Преобразуем обратно в Map
      if (parsed.checks) {
        this.state.checks = new Map(Object.entries(parsed.checks));
      }
      if (parsed.logs) {
        this.state.logs = new Map(Object.entries(parsed.logs));
      }
      if (parsed.habits) {
        this.state.habits = parsed.habits;
      }
      if (parsed.rituals) {
        this.state.rituals = parsed.rituals;
      }
      if (parsed.settings) {
        this.state.settings = { ...this.state.settings, ...parsed.settings };
      }
      
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }

  saveState(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      
      // Преобразуем Map в обычные объекты для JSON
      const toSave = {
        habits: this.state.habits,
        checks: Object.fromEntries(this.state.checks),
        logs: Object.fromEntries(this.state.logs),
        rituals: this.state.rituals,
        settings: this.state.settings
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  // Habits
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

  // Checks
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

  getCheck(habitId: string, date: string): Check | undefined {
    const key = `${habitId}_${date}`;
    return this.state.checks.get(key);
  }

  // Logs
  setDayLog(date: string, log: DayLog): void {
    this.state.logs.set(date, log);
    this.saveState();
    this.notify();
  }

  getDayLog(date: string): DayLog | undefined {
    return this.state.logs.get(date);
  }

  // Rituals
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

  getRituals(): Ritual[] {
    return this.state.rituals;
  }
}

export const storage = new Storage();
