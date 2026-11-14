export const APP_VERSION = '1.0.0' as const;
export const SYNC_PROTOCOL_VERSION = 2 as const;

export const STORAGE_VERSION = 3 as const;
export const STORAGE_KEY = `habit_diary_v${STORAGE_VERSION}` as const;
export const LEGACY_STORAGE_KEYS = Object.freeze([
  'habit_diary_v1',
  'habit_diary_v2',
  'habit_diary_state_v1',
  'hd_state_v1'
] as const);

export const DB_NAME_PROD = 'habit_diary_idb' as const;
export const DB_NAME_TEST = 'habit_diary_idb_test' as const;
export const DB_SCHEMA_VERSION = 3 as const;

export const CLOUD_SETTINGS_KEY = 'hd_settings_v3' as const;
export const DEVICE_ID_KEY = 'hd_device_id_v1' as const;
export const DIAG_LOG_KEY = 'hd_diag_log_v1' as const;

export const STATUS = Object.freeze({
  FULL: 'full',
  PLAN_B: 'plan_b',
  SKIP: 'skip',
  COUNTER: 'counter'
} as const);

export const SPHERES = Object.freeze({
  BODY: 'Тело',
  MIND: 'Разум',
  WORK: 'Дело',
  SPIRIT: 'Дух'
} as const);

export const SPHERE_META = Object.freeze({
  Тело: {
    color: '#34C759',
    glow: 'rgba(52, 199, 89, 0.22)',
    badge: 'Движение и здоровье'
  },
  Разум: {
    color: '#32ADE6',
    glow: 'rgba(50, 173, 230, 0.22)',
    badge: 'Ясность и обучение'
  },
  Дело: {
    color: '#FF9F0A',
    glow: 'rgba(255, 159, 10, 0.22)',
    badge: 'Фокус и созидание'
  },
  Дух: {
    color: '#BF5AF2',
    glow: 'rgba(191, 90, 242, 0.22)',
    badge: 'Спокойствие и смысл'
  }
} as const);

export const SKIP_REASONS = Object.freeze({
  TIRED: 'Устал / мало энергии',
  NO_TIME: 'Не хватило времени',
  SICK: 'Болезнь / восстановление',
  FORGOT: 'Вылетело из головы',
  CONTEXT_CHANGED: 'Сменились планы дня',
  NO_MOOD: 'Эмоциональный спад',
  OTHER: 'Свой вариант'
} as const);

export const HABIT_TYPES = Object.freeze({
  BINARY: 'binary',
  COUNTER: 'counter',
  TIMER: 'timer'
} as const);

export const SCHEDULE_TYPES = Object.freeze({
  DAILY: 'daily',
  WEEKDAYS: 'weekdays',
  WEEKENDS: 'weekends',
  CUSTOM: 'custom',
  TIMES_PER_WEEK: 'times_per_week'
} as const);

export const MILESTONES = Object.freeze([7, 10, 14, 21, 30, 50, 60, 90, 100, 180, 365] as const);
export const MASTERY_TARGETS = Object.freeze([30, 60, 90] as const);

export const DAY_BOUNDARY_HOUR = 4 as const;
export const MAX_STREAK_ITERATIONS = 3650 as const;
export const ANNUAL_HEATMAP_DAYS = 364 as const;
export const DATE_SCROLLER_DAYS = 21 as const;
export const TRASH_RETENTION_DAYS = 30 as const;
export const SHIELD_REWARD_STREAK_DAYS = 14 as const;
export const DEFAULT_SHIELDS = 2 as const;
export const MAX_HABIT_TITLE_LEN = 100 as const;
export const MAX_TRIGGER_LEN = 200 as const;
export const MAX_NORM_LEN = 50 as const;
export const MAX_CAPSULE_LEN = 500 as const;
export const MAX_HABIT_DESCRIPTION_LEN = 1000 as const;
export const MAX_RITUAL_STEPS = 20 as const;
export const MIN_STEP_MINUTES = 1 as const;
export const MAX_STEP_MINUTES = 120 as const;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_DIAG_ENTRIES = 50 as const;
export const MAX_ROLLING_SNAPSHOTS = 3 as const;
export const MAX_OUTBOX_SIZE = 1000 as const;
export const UNDO_HISTORY_LIMIT = 40 as const;

export const SWIPE_THRESHOLDS = Object.freeze({
  EDGE_GUARD_PX: 24,
  DIRECTION_LOCK_PX: 10,
  PLAN_B_RIGHT_PX: 65,
  FULL_RIGHT_PX: 130,
  SKIP_LEFT_PX: -75,
  MAX_DRAG_RIGHT_PX: 190,
  MAX_DRAG_LEFT_PX: -145
} as const);

export const ENERGY_LABELS = Object.freeze({
  0: 'Не отмечено',
  1: 'На нуле • Бережный режим',
  2: 'Низкий заряд • Лучше План Б',
  3: 'Ровный рабочий ритм',
  4: 'Хороший запас сил',
  5: 'Пиковый поток энергии'
} as const);

export const MONTHLY_ARCHETYPES = Object.freeze([
  {
    id: 'architect',
    minRate: 85,
    title: 'Архитектор системы',
    badge: 'Системное мастерство',
    description: 'Твои привычки работают как единый часовой механизм: высокая стабильность сочетается с гибкостью в сложные дни.'
  },
  {
    id: 'resilient',
    minRate: 65,
    minSavedRatio: 0.25,
    title: 'Мастер гибкости',
    badge: 'Сила Плана Б',
    description: 'Ты не ломаешь серию при спаде энергии: вовремя включённый План Б спас десятки дней от срыва.'
  },
  {
    id: 'keeper',
    minRate: 60,
    title: 'Хранитель ритма',
    badge: 'Устойчивый темп',
    description: 'Уверенное движение без выгорания. Ты держишь базовый контур привычек и быстро возвращаешься в строй.'
  },
  {
    id: 'explorer',
    minRate: 30,
    title: 'Исследователь опоры',
    badge: 'Калибровка нагрузки',
    description: 'Система проходит проверку реальностью. Упрости План Б до 2 минут у сложных привычек — и ритм стабилизируется.'
  },
  {
    id: 'spark',
    minRate: 0,
    title: 'Хранитель искры',
    badge: 'Точка перезапуска',
    description: 'Даже один маленький шаг возвращает инерцию. Выбери одну ключевую привычку дня и начни с минимальной версии.'
  }
] as const);

export type Status = (typeof STATUS)[keyof typeof STATUS];
export type Sphere = (typeof SPHERES)[keyof typeof SPHERES];
export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS];
export type HabitType = (typeof HABIT_TYPES)[keyof typeof HABIT_TYPES];
export type ScheduleType = (typeof SCHEDULE_TYPES)[keyof typeof SCHEDULE_TYPES];
