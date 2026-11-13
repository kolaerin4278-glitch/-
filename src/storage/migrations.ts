import { SPHERES, STATUS, type Sphere, type Status } from '../constants';
import { createDefaultAppState, createDefaultSettings } from '../core/factory';
import { createEntityId } from '../core/id';
import {
  isValidDateKey,
  parseCheckRecord,
  parseDayLogRecord,
  parseHabitRecord,
  parseRitualRecord
} from '../core/schema';
import type {
  AppState,
  Check,
  DayLog,
  GraduatedHabitRecord,
  Habit,
  Ritual,
  UserSettings,
  WeeklyReflection
} from '../core/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Мигрирует любой формат данных (прототип v0 из Habit Diary (5).html, v1, v2, v3)
 * в строго валидированный и нормализованный AppState с автоисправлением сиротских записей.
 */
export function migrateAndHealRawPayload(raw: unknown): {
  state: AppState;
  warnings: string[];
} {
  const warnings: string[] = [];
  const defaultState = createDefaultAppState();

  if (!isRecord(raw)) {
    warnings.push('Входные данные не являются объектом JSON');
    return { state: defaultState, warnings };
  }

  // 1. Habits + дедупликация по ID
  const habits: Habit[] = [];
  const seenHabitIds = new Set<string>();
  const rawHabits = Array.isArray(raw['habits']) ? raw['habits'] : [];

  rawHabits.forEach((item, index) => {
    if (!isRecord(item)) return;
    let candidateId = typeof item['id'] === 'string' && item['id'].trim() ? item['id'].trim() : createEntityId('hab');
    if (seenHabitIds.has(candidateId)) {
      candidateId = createEntityId('hab');
      warnings.push(`Обнаружен дубликат ID привычки, перегенерирован в ${candidateId}`);
    }
    const parsed = parseHabitRecord({ ...item, id: candidateId, sort: item['sort'] ?? index });
    if (parsed.success) {
      seenHabitIds.add(parsed.data.id);
      habits.push(parsed.data);
    } else {
      warnings.push(`Пропущена повреждённая привычка #${index + 1}: ${parsed.error.message}`);
    }
  });

  habits.sort((a, b) => a.sort - b.sort);

  // 2. Logs + поддержка прототипа v0 (где внутри logs[date].checks хранились отметки привычек)
  const logs = new Map<string, DayLog>();
  const checks = new Map<string, Check>();

  const rawLogs = isRecord(raw['logs']) ? raw['logs'] : {};
  const sortedLogDates = Object.keys(rawLogs).filter(isValidDateKey).sort();

  for (const dateKey of sortedLogDates) {
    const entry = rawLogs[dateKey];
    if (!isRecord(entry)) continue;

    const parsedLog = parseDayLogRecord(entry, dateKey);
    if (parsedLog.success) {
      logs.set(dateKey, parsedLog.data);
    }

    // Миграция вложенных checks из прототипа v0
    if (isRecord(entry['checks'])) {
      for (const [hId, rawCheckVal] of Object.entries(entry['checks'])) {
        const compositeKey = `${hId}_${dateKey}`;
        if (typeof rawCheckVal === 'string') {
          const st = (Object.values(STATUS) as string[]).includes(rawCheckVal)
            ? (rawCheckVal as Status)
            : STATUS.FULL;
          checks.set(compositeKey, { habitId: hId, date: dateKey, status: st, ts: Date.now() });
        } else if (isRecord(rawCheckVal)) {
          const stRaw = typeof rawCheckVal['status'] === 'string' ? rawCheckVal['status'] : STATUS.FULL;
          const st = (Object.values(STATUS) as string[]).includes(stRaw) ? (stRaw as Status) : STATUS.FULL;
          const valNum =
            typeof rawCheckVal['val'] === 'number'
              ? rawCheckVal['val']
              : typeof rawCheckVal['value'] === 'number'
                ? rawCheckVal['value']
                : undefined;
          checks.set(compositeKey, {
            habitId: hId,
            date: dateKey,
            status: st,
            ts: typeof rawCheckVal['ts'] === 'number' ? rawCheckVal['ts'] : Date.now(),
            ...(valNum !== undefined ? { value: valNum } : {}),
            ...(typeof rawCheckVal['reason'] === 'string' ? { skipReason: rawCheckVal['reason'] } : {})
          });
        }
      }
    }
  }

  // 3. Плоский словарь checks (v1 / v2 / v3)
  if (isRecord(raw['checks'])) {
    for (const [key, val] of Object.entries(raw['checks'])) {
      const parsed = parseCheckRecord(val);
      if (parsed.success) {
        const canonicalKey = `${parsed.data.habitId}_${parsed.data.date}`;
        const existing = checks.get(canonicalKey);
        if (!existing || parsed.data.ts >= existing.ts) {
          checks.set(canonicalKey, parsed.data);
        }
      } else {
        warnings.push(`Пропущена битая отметка ${key}`);
      }
    }
  }

  // Самовосстановление целостности: оставляем отметки только существующих привычек (если список привычек не пуст)
  if (seenHabitIds.size > 0) {
    for (const [ck, checkVal] of Array.from(checks.entries())) {
      if (!seenHabitIds.has(checkVal.habitId)) {
        checks.delete(ck);
      }
    }
  }

  // 4. Ритуалы + дедупликация
  const rituals: Ritual[] = [];
  const seenRitualSignatures = new Set<string>();
  const rawRituals = Array.isArray(raw['rituals']) ? raw['rituals'] : [];

  rawRituals.forEach((rItem) => {
    if (!isRecord(rItem)) return;
    const candidate = {
      ...rItem,
      id: typeof rItem['id'] === 'string' && rItem['id'].trim() ? rItem['id'].trim() : createEntityId('rit')
    };
    const parsed = parseRitualRecord(candidate);
    if (parsed.success) {
      const sig = `${parsed.data.title.toLowerCase()}::${parsed.data.steps.map((s) => `${s.title}:${s.minutes}`).join('|')}`;
      if (!seenRitualSignatures.has(sig)) {
        seenRitualSignatures.add(sig);
        rituals.push(parsed.data);
      }
    }
  });

  // 5. Полка мастерства (graduated)
  const graduated: GraduatedHabitRecord[] = [];
  const seenGradIds = new Set<string>();
  const rawGrad = Array.isArray(raw['graduated']) ? raw['graduated'] : [];
  for (const gItem of rawGrad) {
    if (!isRecord(gItem)) continue;
    const title = typeof gItem['title'] === 'string' ? gItem['title'].trim() : '';
    if (!title) continue;
    const id = typeof gItem['id'] === 'string' && gItem['id'] ? gItem['id'] : createEntityId('grad');
    if (seenGradIds.has(id)) continue;
    seenGradIds.add(id);
    const sphereRaw = typeof gItem['sphere'] === 'string' ? gItem['sphere'] : SPHERES.WORK;
    graduated.push({
      id,
      habitId: typeof gItem['habitId'] === 'string' ? gItem['habitId'] : id,
      title,
      icon: typeof gItem['icon'] === 'string' ? gItem['icon'].slice(0, 8) : '🏆',
      sphere: (Object.values(SPHERES) as string[]).includes(sphereRaw)
        ? (sphereRaw as Sphere)
        : SPHERES.WORK,
      completedDays: typeof gItem['completedDays'] === 'number' ? gItem['completedDays'] : 60,
      graduatedAt:
        typeof gItem['graduatedAt'] === 'string' ? gItem['graduatedAt'] : new Date().toISOString()
    });
  }

  // 6. Еженедельные рефлексии
  const reflections: WeeklyReflection[] = [];
  if (Array.isArray(raw['reflections'])) {
    for (const refItem of raw['reflections']) {
      if (!isRecord(refItem) || typeof refItem['weekKey'] !== 'string') continue;
      reflections.push({
        weekKey: refItem['weekKey'],
        whatHelped: typeof refItem['whatHelped'] === 'string' ? refItem['whatHelped'].slice(0, 500) : '',
        whatWasHard: typeof refItem['whatWasHard'] === 'string' ? refItem['whatWasHard'].slice(0, 500) : '',
        focusNextWeek:
          typeof refItem['focusNextWeek'] === 'string' ? refItem['focusNextWeek'].slice(0, 500) : '',
        createdAt:
          typeof refItem['createdAt'] === 'string' ? refItem['createdAt'] : new Date().toISOString()
      });
    }
  }

  // 7. Настройки + перенос корневого поля shields из прототипа v0
  const baseSettings = createDefaultSettings();
  const rawSettings = isRecord(raw['settings']) ? raw['settings'] : {};
  const legacyShields =
    typeof raw['shields'] === 'number'
      ? Math.max(0, Math.min(99, Math.trunc(raw['shields'])))
      : undefined;

  const settings: UserSettings = {
    ...baseSettings,
    ...(typeof rawSettings['dayBoundaryHour'] === 'number'
      ? { dayBoundaryHour: Math.max(0, Math.min(12, Math.trunc(rawSettings['dayBoundaryHour']))) }
      : {}),
    ...(typeof rawSettings['haptic'] === 'boolean' ? { haptic: rawSettings['haptic'] } : {}),
    ...(typeof rawSettings['soundEnabled'] === 'boolean' ? { soundEnabled: rawSettings['soundEnabled'] } : {}),
    ...(typeof rawSettings['notifications'] === 'boolean'
      ? { notifications: rawSettings['notifications'] }
      : {}),
    ...(typeof rawSettings['confettiEnabled'] === 'boolean'
      ? { confettiEnabled: rawSettings['confettiEnabled'] }
      : {}),
    ...(typeof rawSettings['reduceMotionOverride'] === 'boolean'
      ? { reduceMotionOverride: rawSettings['reduceMotionOverride'] }
      : {}),
    ...(rawSettings['themeMode'] === 'auto' ||
    rawSettings['themeMode'] === 'dark' ||
    rawSettings['themeMode'] === 'light'
      ? { themeMode: rawSettings['themeMode'] }
      : {}),
    ...(rawSettings['accentColor'] === 'emerald' ||
    rawSettings['accentColor'] === 'cyan' ||
    rawSettings['accentColor'] === 'violet' ||
    rawSettings['accentColor'] === 'amber'
      ? { accentColor: rawSettings['accentColor'] }
      : {}),
    ...(rawSettings['density'] === 'comfortable' || rawSettings['density'] === 'compact'
      ? { density: rawSettings['density'] }
      : {}),
    ...(rawSettings['fontScale'] === 'sm' || rawSettings['fontScale'] === 'md' || rawSettings['fontScale'] === 'lg'
      ? { fontScale: rawSettings['fontScale'] }
      : {}),
    ...(typeof rawSettings['privacyBlur'] === 'boolean' ? { privacyBlur: rawSettings['privacyBlur'] } : {}),
    ...(typeof rawSettings['pinCodeHash'] === 'string' ? { pinCodeHash: rawSettings['pinCodeHash'] } : {}),
    ...(typeof rawSettings['autoLockMinutes'] === 'number'
      ? { autoLockMinutes: Math.max(0, Math.min(120, rawSettings['autoLockMinutes'])) }
      : {}),
    ...(typeof rawSettings['quietHoursStart'] === 'string'
      ? { quietHoursStart: rawSettings['quietHoursStart'] }
      : {}),
    ...(typeof rawSettings['quietHoursEnd'] === 'string'
      ? { quietHoursEnd: rawSettings['quietHoursEnd'] }
      : {}),
    ...(typeof rawSettings['digestTime'] === 'string' ? { digestTime: rawSettings['digestTime'] } : {}),
    ...(typeof rawSettings['historyDepthDays'] === 'number'
      ? { historyDepthDays: Math.max(30, Math.min(3650, rawSettings['historyDepthDays'])) }
      : {}),
    ...(typeof rawSettings['completedAccordionOpen'] === 'boolean'
      ? { completedAccordionOpen: rawSettings['completedAccordionOpen'] }
      : {}),
    ...(typeof rawSettings['onboardingCompleted'] === 'boolean'
      ? { onboardingCompleted: rawSettings['onboardingCompleted'] }
      : {}),
    ...(typeof rawSettings['swipeHintsShownCount'] === 'number'
      ? { swipeHintsShownCount: rawSettings['swipeHintsShownCount'] }
      : {}),
    ...(typeof rawSettings['shields'] === 'number'
      ? { shields: Math.max(0, Math.min(99, Math.trunc(rawSettings['shields']))) }
      : legacyShields !== undefined
        ? { shields: legacyShields }
        : {}),
    ...(typeof rawSettings['vacationUntil'] === 'string'
      ? { vacationUntil: rawSettings['vacationUntil'] }
      : {}),
    ...(typeof rawSettings['oneThingHabitId'] === 'string'
      ? { oneThingHabitId: rawSettings['oneThingHabitId'] }
      : {}),
    ...(isRecord(rawSettings['posterOptions'])
      ? {
          posterOptions: {
            includeUserName: Boolean(rawSettings['posterOptions']['includeUserName'] ?? true),
            includeWeekChart: Boolean(rawSettings['posterOptions']['includeWeekChart'] ?? true),
            includeArchetype: Boolean(rawSettings['posterOptions']['includeArchetype'] ?? true),
            includeWatermark: Boolean(rawSettings['posterOptions']['includeWatermark'] ?? true),
            includeDate: Boolean(rawSettings['posterOptions']['includeDate'] ?? true)
          }
        }
      : {})
  };

  return {
    state: {
      habits,
      checks,
      logs,
      rituals,
      graduated,
      reflections,
      settings,
      lastSavedAt: Date.now(),
      syncStatus: 'idle',
      pendingOutboxCount: 0
    },
    warnings
  };
}

export function serializeAppState(state: AppState): string {
  const sortedLogsEntries = Array.from(state.logs.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedChecksEntries = Array.from(state.checks.entries()).sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify({
    version: 3,
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    checks: Object.fromEntries(sortedChecksEntries),
    logs: Object.fromEntries(sortedLogsEntries),
    rituals: state.rituals,
    graduated: state.graduated,
    reflections: state.reflections,
    settings: state.settings
  });
}
