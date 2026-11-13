import type {
  HabitType,
  ScheduleType,
  SkipReason,
  Sphere,
  Status
} from '../constants';

export interface HabitSchedule {
  readonly type: ScheduleType;
  readonly daysOfWeek?: readonly number[]; // 1 (Пн) .. 7 (Вс)
  readonly timesPerWeek?: number;
}

export interface Habit {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly sphere: Sphere;
  readonly type: HabitType;
  readonly trigger: string;
  readonly contextLocation?: string;
  readonly norm: string;
  readonly planB: string;
  readonly targetValue?: number;
  readonly unit?: string;
  readonly stepValue?: number;
  readonly timerMinutes?: number;
  readonly energyCost?: 1 | 2 | 3;
  readonly schedule?: HabitSchedule;
  readonly stackAfterId?: string;
  readonly masteryTargetDays?: 30 | 60 | 90;
  readonly keystone: boolean;
  readonly incognito: boolean;
  readonly capsule: string;
  readonly capsuleUnlockedAt?: string;
  readonly archivedAt?: string;
  readonly deletedAt?: string;
  readonly graduatedAt?: string;
  readonly sort: number;
  readonly version?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Check {
  readonly habitId: string;
  readonly date: string; // YYYY-MM-DD
  readonly status: Status;
  readonly value?: number;
  readonly skipReason?: SkipReason | string;
  readonly customSkipNote?: string;
  readonly opId?: string;
  readonly deviceId?: string;
  readonly ts: number;
}

export interface DayLog {
  readonly date: string; // YYYY-MM-DD
  readonly energy: number; // 0..5
  readonly mood?: number; // 1..5
  readonly shielded: boolean;
  readonly vacation?: boolean;
  readonly gratitude?: readonly string[];
  readonly helpedNote?: string;
  readonly note?: string;
  readonly updatedAt?: number;
}

export interface RitualStep {
  readonly id?: string;
  readonly title: string;
  readonly minutes: number;
  readonly order: number;
  readonly linkedHabitId?: string;
}

export interface Ritual {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly steps: RitualStep[];
  readonly deletedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GraduatedHabitRecord {
  readonly id: string;
  readonly habitId: string;
  readonly title: string;
  readonly icon: string;
  readonly sphere: Sphere;
  readonly completedDays: number;
  readonly graduatedAt: string;
}

export interface WeeklyReflection {
  readonly weekKey: string; // YYYY-Www
  readonly whatHelped: string;
  readonly whatWasHard: string;
  readonly focusNextWeek: string;
  readonly createdAt: string;
}

export interface PosterOptions {
  readonly includeUserName: boolean;
  readonly includeWeekChart: boolean;
  readonly includeArchetype: boolean;
  readonly includeWatermark: boolean;
  readonly includeDate: boolean;
}

export interface UserSettings {
  readonly dayBoundaryHour: number;
  readonly haptic: boolean;
  readonly soundEnabled: boolean;
  readonly notifications: boolean;
  readonly confettiEnabled: boolean;
  readonly reduceMotionOverride: boolean;
  readonly themeMode: 'auto' | 'dark' | 'light';
  readonly accentColor: 'emerald' | 'cyan' | 'violet' | 'amber';
  readonly density: 'comfortable' | 'compact';
  readonly fontScale: 'sm' | 'md' | 'lg';
  readonly privacyBlur: boolean;
  readonly pinCodeHash?: string;
  readonly autoLockMinutes: number;
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
  readonly digestTime: string;
  readonly historyDepthDays: number;
  readonly completedAccordionOpen: boolean;
  readonly onboardingCompleted: boolean;
  readonly swipeHintsShownCount: number;
  readonly shields: number;
  readonly vacationUntil?: string;
  readonly oneThingHabitId?: string;
  readonly posterOptions: PosterOptions;
}

export type OutboxEntity = 'habit' | 'check' | 'day_log' | 'ritual' | 'settings' | 'graduated';
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface OutboxOperation {
  readonly opId: string;
  readonly entity: OutboxEntity;
  readonly entityId: string;
  readonly action: 'upsert' | 'delete';
  readonly payload: unknown;
  readonly priority: 1 | 2 | 3;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextRetryAt: number;
  readonly ts: number;
  readonly deviceId: string;
}

export interface SnapshotRecord {
  readonly id: string;
  readonly kind: 'rolling' | 'daily' | 'pre-import';
  readonly createdAt: string;
  readonly checksum: string;
  readonly serializedState: string;
  readonly habitsCount: number;
  readonly checksCount: number;
}

export interface DiagnosticLogEntry {
  readonly id: string;
  readonly level: 'info' | 'warn' | 'error';
  readonly code: string;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: Record<string, string | number | boolean>;
}

export interface AppState {
  habits: Habit[];
  checks: Map<string, Check>;
  logs: Map<string, DayLog>;
  rituals: Ritual[];
  graduated: GraduatedHabitRecord[];
  reflections: WeeklyReflection[];
  settings: UserSettings;
  selectedDateKey?: string;
  lastSavedAt?: number;
  syncStatus?: 'idle' | 'syncing' | 'offline' | 'synced' | 'error';
  pendingOutboxCount?: number;
}

export interface AppEventMap {
  'state:changed': { state: AppState; sourceCommand: string };
  'habit:checked': { habitId: string; date: string; status: Status; streak: number };
  'habit:milestone': { habit: Habit; streak: number };
  'shield:activated': { date: string; remainingShields: number };
  'shield:rewarded': { habitTitle: string; totalShields: number };
  'capsule:unlocked': { habit: Habit; reason: 'two-misses' | 'day-30' | 'manual' };
  'ritual:step-changed': { ritualId: string; stepIndex: number; stepTitle: string };
  'ritual:completed': { ritualId: string; ritualTitle: string };
  'sync:status': { status: 'idle' | 'syncing' | 'offline' | 'synced' | 'error'; pending: number };
  'island:notify': {
    message: string;
    icon?: string;
    tone?: 'default' | 'success' | 'amber' | 'danger';
    undoLabel?: string;
    onUndo?: () => void;
    durationMs?: number;
  };
  'safe-mode:activated': { reason: string };
  'diagnostics:logged': DiagnosticLogEntry;
}
