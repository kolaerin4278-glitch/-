import {
  HABIT_TYPES,
  MAX_CAPSULE_LEN,
  MAX_HABIT_DESCRIPTION_LEN,
  MAX_HABIT_TITLE_LEN,
  MAX_NORM_LEN,
  MAX_RITUAL_STEPS,
  MAX_STEP_MINUTES,
  MAX_TRIGGER_LEN,
  MIN_STEP_MINUTES,
  SPHERES,
  STATUS,
  type HabitType,
  type Sphere,
  type Status
} from '../constants';
import { ValidationError } from './errors';
import type { Check, DayLog, Habit, Ritual, RitualStep } from './types';

export type SafeParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ValidationError };

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_SPHERES = new Set<string>(Object.values(SPHERES));
const VALID_STATUSES = new Set<string>(Object.values(STATUS));
const VALID_HABIT_TYPES = new Set<string>(Object.values(HABIT_TYPES));

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isValidDateKey(val: unknown): val is string {
  if (typeof val !== 'string' || !DATE_KEY_RE.test(val)) return false;
  const parts = val.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  return year >= 1970 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

export function sanitizeIcon(raw: unknown, fallback = '✨'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().replace(/[<>'"&]/g, '');
  if (!trimmed) return fallback;
  const codePoints = Array.from(trimmed);
  return codePoints.slice(0, 4).join('');
}

export function parseHabitRecord(raw: unknown): SafeParseResult<Habit> {
  if (!isRecord(raw)) {
    return { success: false, error: new ValidationError('Объект привычки некорректен', 'habit') };
  }

  const id = typeof raw['id'] === 'string' && raw['id'].trim().length > 0 ? raw['id'].trim() : '';
  if (!id) {
    return { success: false, error: new ValidationError('Отсутствует ID привычки', 'id') };
  }

  const title = typeof raw['title'] === 'string' ? raw['title'].trim() : '';
  if (!title || title.length > MAX_HABIT_TITLE_LEN) {
    return {
      success: false,
      error: new ValidationError(`Название привычки должно быть от 1 до ${MAX_HABIT_TITLE_LEN} символов`, 'title')
    };
  }

  const rawSphere = typeof raw['sphere'] === 'string' ? raw['sphere'] : SPHERES.WORK;
  const sphere: Sphere = VALID_SPHERES.has(rawSphere) ? (rawSphere as Sphere) : SPHERES.WORK;

  const rawType = typeof raw['type'] === 'string' ? raw['type'] : HABIT_TYPES.BINARY;
  const type: HabitType = VALID_HABIT_TYPES.has(rawType) ? (rawType as HabitType) : HABIT_TYPES.BINARY;

  const trigger = typeof raw['trigger'] === 'string' ? raw['trigger'].trim().slice(0, MAX_TRIGGER_LEN) : '';
  const norm =
    typeof raw['norm'] === 'string' && raw['norm'].trim()
      ? raw['norm'].trim().slice(0, MAX_NORM_LEN)
      : 'Выполнено';
  const planB =
    typeof raw['planB'] === 'string' && raw['planB'].trim()
      ? raw['planB'].trim().slice(0, MAX_NORM_LEN)
      : 'Минимум 2 мин';
  const capsule = typeof raw['capsule'] === 'string' ? raw['capsule'].trim().slice(0, MAX_CAPSULE_LEN) : '';

  const nowIso = new Date().toISOString();
  const createdAt = typeof raw['createdAt'] === 'string' && raw['createdAt'] ? raw['createdAt'] : nowIso;
  const updatedAt = typeof raw['updatedAt'] === 'string' && raw['updatedAt'] ? raw['updatedAt'] : createdAt;

  const base: Habit = {
    id,
    title,
    icon: sanitizeIcon(raw['icon'], '✨'),
    sphere,
    type,
    trigger,
    norm,
    planB,
    keystone: Boolean(raw['keystone']),
    incognito: Boolean(raw['incognito']),
    capsule,
    sort: typeof raw['sort'] === 'number' && Number.isFinite(raw['sort']) ? Math.trunc(raw['sort']) : 0,
    createdAt,
    updatedAt,
    ...(typeof raw['contextLocation'] === 'string' && raw['contextLocation'].trim()
      ? { contextLocation: raw['contextLocation'].trim().slice(0, 100) }
      : {}),
    ...(typeof raw['targetValue'] === 'number' && raw['targetValue'] > 0
      ? { targetValue: Math.min(10000, raw['targetValue']) }
      : {}),
    ...(typeof raw['unit'] === 'string' && raw['unit'].trim()
      ? { unit: raw['unit'].trim().slice(0, 20) }
      : {}),
    ...(typeof raw['stepValue'] === 'number' && raw['stepValue'] > 0
      ? { stepValue: Math.min(1000, raw['stepValue']) }
      : {}),
    ...(typeof raw['timerMinutes'] === 'number' && raw['timerMinutes'] >= 1
      ? { timerMinutes: Math.min(240, Math.round(raw['timerMinutes'])) }
      : {}),
    ...(raw['energyCost'] === 1 || raw['energyCost'] === 2 || raw['energyCost'] === 3
      ? { energyCost: raw['energyCost'] }
      : {}),
    ...(isRecord(raw['schedule']) &&
    (raw['schedule']['type'] === 'daily' ||
      raw['schedule']['type'] === 'weekdays' ||
      raw['schedule']['type'] === 'weekends' ||
      raw['schedule']['type'] === 'custom' ||
      raw['schedule']['type'] === 'times_per_week')
      ? {
          schedule: {
            type: raw['schedule']['type'],
            ...(Array.isArray(raw['schedule']['daysOfWeek'])
              ? {
                  daysOfWeek: (raw['schedule']['daysOfWeek'] as unknown[])
                    .map(Number)
                    .filter((d) => d >= 1 && d <= 7)
                }
              : {}),
            ...(typeof raw['schedule']['timesPerWeek'] === 'number'
              ? { timesPerWeek: Math.max(1, Math.min(7, Math.round(raw['schedule']['timesPerWeek']))) }
              : {})
          }
        }
      : {}),
    ...(typeof raw['stackAfterId'] === 'string' && raw['stackAfterId']
      ? { stackAfterId: raw['stackAfterId'] }
      : {}),
    ...(raw['masteryTargetDays'] === 30 || raw['masteryTargetDays'] === 60 || raw['masteryTargetDays'] === 90
      ? { masteryTargetDays: raw['masteryTargetDays'] }
      : {}),
    ...(typeof raw['capsuleUnlockedAt'] === 'string' ? { capsuleUnlockedAt: raw['capsuleUnlockedAt'] } : {}),
    ...(typeof raw['archivedAt'] === 'string' ? { archivedAt: raw['archivedAt'] } : {}),
    ...(typeof raw['deletedAt'] === 'string' ? { deletedAt: raw['deletedAt'] } : {}),
    ...(typeof raw['graduatedAt'] === 'string' ? { graduatedAt: raw['graduatedAt'] } : {}),
    ...(typeof raw['microPlanB'] === 'string' && raw['microPlanB'].trim()
      ? { microPlanB: raw['microPlanB'].trim().slice(0, MAX_NORM_LEN) }
      : {}),
    ...(typeof raw['description'] === 'string' && raw['description'].trim()
      ? { description: raw['description'].trim().slice(0, MAX_HABIT_DESCRIPTION_LEN) }
      : {}),
    ...(typeof raw['color'] === 'string' && HEX_COLOR_RE.test(raw['color'])
      ? { color: raw['color'] }
      : {}),
    ...(isRecord(raw['reminder'])
      ? {
          reminder: {
            time: typeof raw['reminder']['time'] === 'string' && TIME_RE.test(raw['reminder']['time'])
              ? raw['reminder']['time']
              : '09:00',
            days: Array.isArray(raw['reminder']['days'])
              ? (raw['reminder']['days'] as unknown[]).map(Number).filter((d) => d >= 1 && d <= 7)
              : [],
            enabled: Boolean(raw['reminder']['enabled'])
          }
        }
      : {}),
    ...(typeof raw['version'] === 'number' ? { version: Math.max(1, Math.trunc(raw['version'])) } : {})
  };

  return { success: true, data: base };
}

export function parseCheckRecord(raw: unknown): SafeParseResult<Check> {
  if (!isRecord(raw)) {
    return { success: false, error: new ValidationError('Запись отметки некорректна', 'check') };
  }
  const habitId = typeof raw['habitId'] === 'string' ? raw['habitId'].trim() : '';
  const date = raw['date'];
  const rawStatus = typeof raw['status'] === 'string' ? raw['status'] : '';

  if (!habitId || !isValidDateKey(date) || !VALID_STATUSES.has(rawStatus)) {
    return { success: false, error: new ValidationError('Невалидные поля отметки привычки', 'check') };
  }

  const ts = typeof raw['ts'] === 'number' && Number.isFinite(raw['ts']) ? raw['ts'] : Date.now();

  const check: Check = {
    habitId,
    date,
    status: rawStatus as Status,
    ts,
    ...(typeof raw['value'] === 'number' && Number.isFinite(raw['value']) ? { value: raw['value'] } : {}),
    ...(typeof raw['skipReason'] === 'string' && raw['skipReason'].trim()
      ? { skipReason: raw['skipReason'].trim().slice(0, 120) }
      : {}),
    ...(typeof raw['customSkipNote'] === 'string' && raw['customSkipNote'].trim()
      ? { customSkipNote: raw['customSkipNote'].trim().slice(0, 200) }
      : {}),
    ...(typeof raw['opId'] === 'string' ? { opId: raw['opId'] } : {}),
    ...(typeof raw['deviceId'] === 'string' ? { deviceId: raw['deviceId'] } : {})
  };

  return { success: true, data: check };
}

export function parseDayLogRecord(raw: unknown, fallbackDate?: string): SafeParseResult<DayLog> {
  if (!isRecord(raw)) {
    return { success: false, error: new ValidationError('Запись лога дня некорректна', 'dayLog') };
  }
  const date = isValidDateKey(raw['date']) ? raw['date'] : fallbackDate;
  if (!date || !isValidDateKey(date)) {
    return { success: false, error: new ValidationError('Некорректная дата лога дня', 'date') };
  }

  const rawEnergy = typeof raw['energy'] === 'number' ? Math.round(raw['energy']) : 0;
  const energy = Math.max(0, Math.min(5, rawEnergy));

  // Поле gentle из старого прототипа намеренно отбрасывается (План 07, п. 053)
  const dayLog: DayLog = {
    date,
    energy,
    shielded: Boolean(raw['shielded']),
    ...(typeof raw['mood'] === 'number' && raw['mood'] >= 1 && raw['mood'] <= 5
      ? { mood: Math.round(raw['mood']) }
      : {}),
    ...(typeof raw['vacation'] === 'boolean' ? { vacation: raw['vacation'] } : {}),
    ...(Array.isArray(raw['gratitude'])
      ? {
          gratitude: (raw['gratitude'] as unknown[])
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .slice(0, 5)
            .map((s) => s.trim().slice(0, 160))
        }
      : {}),
    ...(typeof raw['helpedNote'] === 'string' && raw['helpedNote'].trim()
      ? { helpedNote: raw['helpedNote'].trim().slice(0, 300) }
      : {}),
    ...(typeof raw['note'] === 'string' && raw['note'].trim()
      ? { note: raw['note'].trim().slice(0, 500) }
      : {}),
    ...(typeof raw['updatedAt'] === 'number' ? { updatedAt: raw['updatedAt'] } : {})
  };

  return { success: true, data: dayLog };
}

export function parseRitualRecord(raw: unknown): SafeParseResult<Ritual> {
  if (!isRecord(raw)) {
    return { success: false, error: new ValidationError('Объект ритуала некорректен', 'ritual') };
  }
  const id = typeof raw['id'] === 'string' && raw['id'].trim() ? raw['id'].trim() : '';
  const title = typeof raw['title'] === 'string' ? raw['title'].trim().slice(0, MAX_HABIT_TITLE_LEN) : '';
  if (!id || !title) {
    return { success: false, error: new ValidationError('У ритуала отсутствуют ID или название', 'title') };
  }

  const rawSteps = Array.isArray(raw['steps']) ? raw['steps'].slice(0, MAX_RITUAL_STEPS) : [];
  const steps: RitualStep[] = [];
  rawSteps.forEach((stepItem, idx) => {
    if (!isRecord(stepItem)) return;
    const stepTitle = typeof stepItem['title'] === 'string' ? stepItem['title'].trim().slice(0, 100) : '';
    if (!stepTitle) return;
    const rawMin = typeof stepItem['minutes'] === 'number' ? Math.round(stepItem['minutes']) : 3;
    const minutes = Math.max(MIN_STEP_MINUTES, Math.min(MAX_STEP_MINUTES, rawMin));
    steps.push({
      title: stepTitle,
      minutes,
      order: idx,
      ...(typeof stepItem['id'] === 'string' ? { id: stepItem['id'] } : {}),
      ...(typeof stepItem['linkedHabitId'] === 'string' && stepItem['linkedHabitId']
        ? { linkedHabitId: stepItem['linkedHabitId'] }
        : {})
    });
  });

  if (steps.length === 0) {
    return { success: false, error: new ValidationError('Ритуал должен содержать хотя бы 1 шаг', 'steps') };
  }

  const nowIso = new Date().toISOString();
  const createdAt = typeof raw['createdAt'] === 'string' && raw['createdAt'] ? raw['createdAt'] : nowIso;
  const updatedAt = typeof raw['updatedAt'] === 'string' && raw['updatedAt'] ? raw['updatedAt'] : createdAt;

  return {
    success: true,
    data: {
      id,
      title,
      icon: sanitizeIcon(raw['icon'], '🌅'),
      steps,
      createdAt,
      updatedAt,
      ...(typeof raw['deletedAt'] === 'string' ? { deletedAt: raw['deletedAt'] } : {})
    }
  };
}
