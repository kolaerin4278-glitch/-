import { DAY_BOUNDARY_HOUR } from './constants';
import type { Habit } from './core/types';

const formatters = new Map<string, Intl.DateTimeFormat>();
const periodKeysCache = new Map<string, readonly string[]>();
let lastMinuteBucket = -1;
let lastFormattedMinute = '';

function getFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  const existing = formatters.get(key);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat('ru-RU', options);
  formatters.set(key, created);
  return created;
}

export function getTodayKey(boundaryHour: number = DAY_BOUNDARY_HOUR, nowDate: Date = new Date()): string {
  const cursor = new Date(nowDate.getTime());
  if (cursor.getHours() < boundaryHour) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return toDateKey(cursor);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Парсит строковый ключ YYYY-MM-DD строго в локальную полночь (устраняя UTC-сдвиг new Date('YYYY-MM-DD'))
 */
export function fromDateKey(key: string): Date {
  const parts = key.split('-').map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDaysToKey(dateKey: string, deltaDays: number): string {
  const d = fromDateKey(dateKey);
  d.setDate(d.getDate() + deltaDays);
  return toDateKey(d);
}

export function formatDate(date: Date): string {
  const formatter = getFormatter({
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const formatted = formatter.format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatFullDateAccessible(dateKey: string): string {
  const formatter = getFormatter({
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  return formatter.format(fromDateKey(dateKey));
}

export function formatShortWeekday(dateKey: string): string {
  const formatter = getFormatter({ weekday: 'short' });
  return formatter.format(fromDateKey(dateKey)).replace('.', '');
}

export function formatShortMonth(dateKey: string): string {
  const formatter = getFormatter({ month: 'short' });
  return formatter.format(fromDateKey(dateKey)).replace('.', '');
}

export function formatTimeHHMM(ts: number): string {
  const bucket = Math.floor(ts / 60_000);
  if (bucket === lastMinuteBucket && lastFormattedMinute) {
    return lastFormattedMinute;
  }
  const formatted = getFormatter({ hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  if (Math.abs(Date.now() - ts) < 60_000) {
    lastMinuteBucket = bucket;
    lastFormattedMinute = formatted;
  }
  return formatted;
}

/**
 * Возвращает ISO-день недели: 1 (Пн) .. 7 (Вс)
 */
export function getIsoWeekday(dateKey: string): number {
  const jsDay = fromDateKey(dateKey).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function getIsoWeekKey(dateKey: string): string {
  const d = fromDateKey(dateKey);
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1, 12, 0, 0);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function isHabitScheduledOnDate(habit: Habit, dateKey: string): boolean {
  const sched = habit.schedule;
  if (!sched || sched.type === 'daily') return true;
  const isoDow = getIsoWeekday(dateKey);
  if (sched.type === 'weekdays') return isoDow >= 1 && isoDow <= 5;
  if (sched.type === 'weekends') return isoDow === 6 || isoDow === 7;
  if (sched.type === 'custom' && sched.daysOfWeek && sched.daysOfWeek.length > 0) {
    return sched.daysOfWeek.includes(isoDow);
  }
  return true;
}

/**
 * Мемоизированная генерация массива дат (План 10 п. 015)
 */
export function getPeriodDateKeys(daysBack: number, endKey?: string, boundaryHour?: number): string[] {
  const resolvedEnd = endKey ?? getTodayKey(boundaryHour ?? DAY_BOUNDARY_HOUR);
  const cacheKey = `${daysBack}:${resolvedEnd}`;
  const cached = periodKeysCache.get(cacheKey);
  if (cached) return [...cached];

  const end = fromDateKey(resolvedEnd);
  const keys: string[] = [];
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(end.getTime());
    date.setDate(date.getDate() - i);
    keys.push(toDateKey(date));
  }

  if (periodKeysCache.size > 32) {
    periodKeysCache.clear();
  }
  periodKeysCache.set(cacheKey, keys);
  return [...keys];
}

export function getCurrentMonthDateKeys(todayKey: string): string[] {
  const today = fromDateKey(todayKey);
  const dayOfMonth = today.getDate();
  return getPeriodDateKeys(dayOfMonth, todayKey);
}
