import { MAX_STREAK_ITERATIONS, STATUS } from './constants';
import { addDaysToKey, fromDateKey, isHabitScheduledOnDate, toDateKey } from './date';
import type { Check, DayLog, Habit } from './types';

function isProtectedFreezeDay(
  dateKey: string,
  dayLog: DayLog | undefined,
  vacationUntil?: string
): boolean {
  if (dayLog?.shielded || dayLog?.vacation) return true;
  if (vacationUntil && dateKey <= vacationUntil) return true;
  return false;
}

/**
 * Чистая детерминированная функция расчёта текущей серии привычки (План 06 пп. 044–045, 505, 523):
 * - учитывает План Б наравне с Нормой;
 * - учитывает щиты дня и режим отпуска/восстановления;
 * - учитывает гибкое расписание привычки (будни / выходные / выбранные дни).
 */
export function computeStreak(
  habit: Habit,
  checks: ReadonlyMap<string, Check>,
  logs: ReadonlyMap<string, DayLog>,
  todayKey: string,
  vacationUntil?: string
): number {
  let streak = 0;
  const cursor = fromDateKey(todayKey);

  for (let i = 0; i < MAX_STREAK_ITERATIONS; i++) {
    const key = toDateKey(cursor);
    const check = checks.get(`${habit.id}_${key}`);
    const dayLog = logs.get(key);

    if (check && (check.status === STATUS.FULL || check.status === STATUS.PLAN_B)) {
      streak++;
    } else if (isProtectedFreezeDay(key, dayLog, vacationUntil)) {
      // Щит или отпуск сохраняет серию без обнуления
    } else if (!isHabitScheduledOnDate(habit, key)) {
      // Вне расписания привычки день не прерывает серию
    } else if (i === 0 && !check) {
      // Сегодня ещё может быть не закрыто — проверяем начиная со вчерашнего дня
    } else {
      break;
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function computeLongestStreak(
  habit: Habit,
  checks: ReadonlyMap<string, Check>,
  logs: ReadonlyMap<string, DayLog>,
  todayKey: string,
  lookbackDays = 365
): number {
  let best = 0;
  let running = 0;

  for (let offset = lookbackDays - 1; offset >= 0; offset--) {
    const key = addDaysToKey(todayKey, -offset);
    const check = checks.get(`${habit.id}_${key}`);
    const dayLog = logs.get(key);

    if (check && (check.status === STATUS.FULL || check.status === STATUS.PLAN_B)) {
      running++;
      if (running > best) best = running;
    } else if (isProtectedFreezeDay(key, dayLog) || !isHabitScheduledOnDate(habit, key)) {
      // продолжаем без сброса
    } else if (offset === 0 && !check) {
      // сегодняшний незавершённый день не обнуляет лучший результат
    } else {
      running = 0;
    }
  }

  return best;
}

export interface TwoDayRuleAlert {
  readonly triggered: boolean;
  readonly consecutiveMisses: number;
  readonly shouldRevealCapsule: boolean;
  readonly recoveryHint: string;
}

/**
 * Правило двух дней Джеймса Клира: предупреждение после 1 пропуска и капсула времени после 2 пропусков подряд
 */
export function evaluateTwoDayRule(
  habit: Habit,
  checks: ReadonlyMap<string, Check>,
  logs: ReadonlyMap<string, DayLog>,
  todayKey: string
): TwoDayRuleAlert {
  let consecutiveMisses = 0;
  let checkedDays = 0;

  for (let back = 1; back <= 7 && checkedDays < 3; back++) {
    const key = addDaysToKey(todayKey, -back);
    if (key < habit.createdAt.slice(0, 10)) break;
    if (!isHabitScheduledOnDate(habit, key)) continue;

    const log = logs.get(key);
    if (log?.shielded || log?.vacation) break;

    checkedDays++;
    const check = checks.get(`${habit.id}_${key}`);
    if (!check || check.status === STATUS.SKIP) {
      consecutiveMisses++;
    } else if (check.status === STATUS.FULL || check.status === STATUS.PLAN_B) {
      break;
    }
  }

  const todayCheck = checks.get(`${habit.id}_${todayKey}`);
  const alreadyDoneToday =
    todayCheck?.status === STATUS.FULL || todayCheck?.status === STATUS.PLAN_B;

  if (alreadyDoneToday || consecutiveMisses === 0) {
    return {
      triggered: false,
      consecutiveMisses: 0,
      shouldRevealCapsule: false,
      recoveryHint: ''
    };
  }

  const shouldRevealCapsule = consecutiveMisses >= 2 && Boolean(habit.capsule.trim());
  const recoveryHint =
    consecutiveMisses >= 2
      ? `Два пропуска позади — верни ритм мягким шагом «${habit.planB}»`
      : `Вчера был пропуск • Правило двух дней: закрой хотя бы «${habit.planB}»`;

  return {
    triggered: true,
    consecutiveMisses,
    shouldRevealCapsule,
    recoveryHint
  };
}

/**
 * Пакетный кэш стриков на один кадр рендера экрана (План 06 п. 014)
 */
export function buildStreakMap(
  habits: readonly Habit[],
  checks: ReadonlyMap<string, Check>,
  logs: ReadonlyMap<string, DayLog>,
  referenceDateKey: string,
  vacationUntil?: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const h of habits) {
    map.set(h.id, computeStreak(h, checks, logs, referenceDateKey, vacationUntil));
  }
  return map;
}
