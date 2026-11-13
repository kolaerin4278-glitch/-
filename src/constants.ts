export const STATUS = {
  FULL: 'full',
  PLAN_B: 'plan_b',
  SKIP: 'skip',
  COUNTER: 'counter'
} as const;

export const SPHERES = {
  BODY: 'Тело',
  MIND: 'Разум',
  WORK: 'Дело',
  SPIRIT: 'Дух'
} as const;

export const SKIP_REASONS = {
  TIRED: 'Устал',
  NO_TIME: 'Не было времени',
  SICK: 'Болел',
  FORGOT: 'Забыл',
  NO_MOOD: 'Не было настроения',
  OTHER: 'Другое'
} as const;

export const MILESTONES = [7, 14, 30, 60, 100] as const;

export const DAY_BOUNDARY_HOUR = 4;

export const STORAGE_VERSION = 1;
export const STORAGE_KEY = `habit_diary_v${STORAGE_VERSION}`;

export type Status = typeof STATUS[keyof typeof STATUS];
export type Sphere = typeof SPHERES[keyof typeof SPHERES];
export type SkipReason = typeof SKIP_REASONS[keyof typeof SKIP_REASONS];
