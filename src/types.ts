import type { Status, Sphere, SkipReason } from './constants';

export interface Habit {
  id: string;
  title: string;
  icon: string;
  sphere: Sphere;
  type: 'binary' | 'counter';
  trigger: string;
  norm: string;
  planB: string;
  keystone: boolean;
  incognito: boolean;
  capsule: string;
  archivedAt?: string;
  deletedAt?: string;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface Check {
  habitId: string;
  date: string;
  status: Status;
  value?: number;
  skipReason?: SkipReason;
  ts: number;
}

export interface DayLog {
  date: string;
  energy: number;
  shielded: boolean;
  note?: string;
}

export interface Ritual {
  id: string;
  title: string;
  icon: string;
  steps: RitualStep[];
  createdAt: string;
  updatedAt: string;
}

export interface RitualStep {
  title: string;
  minutes: number;
  order: number;
}

export interface AppState {
  habits: Habit[];
  checks: Map<string, Check>;
  logs: Map<string, DayLog>;
  rituals: Ritual[];
  settings: {
    dayBoundaryHour: number;
    haptic: boolean;
    notifications: boolean;
  };
}
