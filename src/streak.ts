import type { Check, DayLog, Habit } from './types';
import { STATUS } from './constants';
import { fromDateKey, toDateKey } from './date';

const MAX_STREAK_ITERATIONS = 3650;

export function computeStreak(
  habit: Habit,
  checks: Map<string, Check>,
  logs: Map<string, DayLog>,
  todayKey: string
): number {
  let streak = 0;
  const cursor = fromDateKey(todayKey);

  for (let i = 0; i < MAX_STREAK_ITERATIONS; i++) {
    const key = toDateKey(cursor);
    const check = checks.get(`${habit.id}_${key}`);
    const dayLog = logs.get(key);

    if (check && (check.status === STATUS.FULL || check.status === STATUS.PLAN_B)) {
      streak++;
    } else if (dayLog?.shielded) {
      // Щит сохраняет серию без увеличения
    } else if (i === 0) {
      // Сегодня ещё может быть не отмечено — проверяем начиная со вчера
    } else {
      break;
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
