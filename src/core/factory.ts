import {
  DAY_BOUNDARY_HOUR,
  DEFAULT_SHIELDS,
  HABIT_TYPES,
  MAX_CAPSULE_LEN,
  MAX_HABIT_TITLE_LEN,
  MAX_NORM_LEN,
  MAX_RITUAL_STEPS,
  MAX_STEP_MINUTES,
  MAX_TRIGGER_LEN,
  MIN_STEP_MINUTES,
  SPHERES
} from '../constants';
import { BusinessRuleError, ValidationError } from './errors';
import { createEntityId } from './id';
import { sanitizeIcon } from './schema';
import type { AppState, Habit, Ritual, RitualStep, UserSettings } from './types';

export function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultSettings(): UserSettings {
  return {
    dayBoundaryHour: DAY_BOUNDARY_HOUR,
    haptic: true,
    soundEnabled: true,
    notifications: true,
    confettiEnabled: true,
    reduceMotionOverride: false,
    themeMode: 'auto',
    accentColor: 'emerald',
    density: 'comfortable',
    fontScale: 'md',
    privacyBlur: false,
    autoLockMinutes: 0,
    quietHoursStart: '23:00',
    quietHoursEnd: '08:00',
    digestTime: '21:00',
    historyDepthDays: 365,
    completedAccordionOpen: false,
    onboardingCompleted: false,
    swipeHintsShownCount: 0,
    shields: DEFAULT_SHIELDS,
    posterOptions: {
      includeUserName: true,
      includeWeekChart: true,
      includeArchetype: true,
      includeWatermark: true,
      includeDate: true
    }
  };
}

export function createDefaultAppState(): AppState {
  return {
    habits: [],
    checks: new Map(),
    logs: new Map(),
    rituals: [],
    graduated: [],
    reflections: [],
    settings: createDefaultSettings(),
    syncStatus: 'idle',
    pendingOutboxCount: 0
  };
}

export interface CreateHabitInput {
  title: string;
  icon?: string;
  sphere?: Habit['sphere'];
  type?: Habit['type'];
  trigger?: string;
  contextLocation?: string;
  norm?: string;
  planB?: string;
  targetValue?: number;
  unit?: string;
  stepValue?: number;
  timerMinutes?: number;
  energyCost?: 1 | 2 | 3;
  schedule?: Habit['schedule'];
  stackAfterId?: string;
  masteryTargetDays?: 30 | 60 | 90;
  keystone?: boolean;
  incognito?: boolean;
  capsule?: string;
  sort?: number;
}

export function createHabitEntity(input: CreateHabitInput, currentCount = 0): Habit {
  const title = input.title.trim();
  if (!title) {
    throw new ValidationError('Введите название привычки', 'title');
  }
  if (title.length > MAX_HABIT_TITLE_LEN) {
    throw new ValidationError(`Название не должно превышать ${MAX_HABIT_TITLE_LEN} символов`, 'title');
  }

  const type = input.type ?? HABIT_TYPES.BINARY;
  const targetValue =
    type === HABIT_TYPES.COUNTER
      ? Math.max(1, Math.min(10000, Math.round(input.targetValue ?? 8)))
      : undefined;
  const stepValue =
    type === HABIT_TYPES.COUNTER
      ? Math.max(1, Math.min(targetValue ?? 100, Math.round(input.stepValue ?? 1)))
      : undefined;
  const unit =
    type === HABIT_TYPES.COUNTER
      ? (input.unit?.trim().slice(0, 16) || 'раз')
      : undefined;
  const timerMinutes =
    type === HABIT_TYPES.TIMER
      ? Math.max(1, Math.min(240, Math.round(input.timerMinutes ?? 15)))
      : undefined;

  const defaultNorm =
    type === HABIT_TYPES.COUNTER && targetValue && unit
      ? `${targetValue} ${unit}`
      : type === HABIT_TYPES.TIMER && timerMinutes
        ? `${timerMinutes} мин`
        : 'Выполнено';

  const defaultPlanB =
    type === HABIT_TYPES.COUNTER && targetValue && unit
      ? `${Math.max(1, Math.ceil(targetValue / 2))} ${unit}`
      : type === HABIT_TYPES.TIMER && timerMinutes
        ? `${Math.max(2, Math.ceil(timerMinutes / 5))} мин`
        : 'Минимум 2 мин';

  const now = new Date().toISOString();

  return {
    id: createEntityId('hab'),
    title,
    icon: sanitizeIcon(input.icon, '✨'),
    sphere: input.sphere ?? SPHERES.WORK,
    type,
    trigger: (input.trigger ?? '').trim().slice(0, MAX_TRIGGER_LEN),
    norm: (input.norm?.trim() || defaultNorm).slice(0, MAX_NORM_LEN),
    planB: (input.planB?.trim() || defaultPlanB).slice(0, MAX_NORM_LEN),
    keystone: Boolean(input.keystone),
    incognito: Boolean(input.incognito),
    capsule: (input.capsule ?? '').trim().slice(0, MAX_CAPSULE_LEN),
    energyCost: input.energyCost ?? 2,
    masteryTargetDays: input.masteryTargetDays ?? 60,
    schedule: input.schedule ?? { type: 'daily' },
    sort: input.sort ?? currentCount,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(input.contextLocation?.trim()
      ? { contextLocation: input.contextLocation.trim().slice(0, 100) }
      : {}),
    ...(targetValue !== undefined ? { targetValue } : {}),
    ...(unit !== undefined ? { unit } : {}),
    ...(stepValue !== undefined ? { stepValue } : {}),
    ...(timerMinutes !== undefined ? { timerMinutes } : {}),
    ...(input.stackAfterId ? { stackAfterId: input.stackAfterId } : {})
  };
}

export interface CreateRitualInput {
  title: string;
  icon?: string;
  steps: ReadonlyArray<{
    title: string;
    minutes: number;
    order?: number;
    linkedHabitId?: string;
  }>;
}

export function createRitualEntity(input: CreateRitualInput): Ritual {
  const title = input.title.trim();
  if (!title || title.length > MAX_HABIT_TITLE_LEN) {
    throw new ValidationError('Укажите корректное название ритуала (до 100 символов)', 'title');
  }
  if (input.steps.length === 0 || input.steps.length > MAX_RITUAL_STEPS) {
    throw new BusinessRuleError(`Ритуал должен содержать от 1 до ${MAX_RITUAL_STEPS} шагов`);
  }

  const steps: RitualStep[] = input.steps.map((step, index) => {
    const stepTitle = step.title.trim();
    if (!stepTitle) {
      throw new ValidationError(`Заполните название для шага №${index + 1}`, 'steps');
    }
    const minutes = Math.max(MIN_STEP_MINUTES, Math.min(MAX_STEP_MINUTES, Math.round(step.minutes || 1)));
    return {
      id: createEntityId('step'),
      title: stepTitle.slice(0, 100),
      minutes,
      order: index,
      ...(step.linkedHabitId ? { linkedHabitId: step.linkedHabitId } : {})
    };
  });

  const now = new Date().toISOString();
  return {
    id: createEntityId('rit'),
    title,
    icon: sanitizeIcon(input.icon, '🌅'),
    steps,
    createdAt: now,
    updatedAt: now
  };
}
