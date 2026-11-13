import { DAY_BOUNDARY_HOUR } from './constants';

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  const existing = formatters.get(key);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat('ru-RU', options);
  formatters.set(key, created);
  return created;
}

export function getTodayKey(boundaryHour: number = DAY_BOUNDARY_HOUR): string {
  const now = new Date();
  const hour = now.getHours();

  if (hour < boundaryHour) {
    now.setDate(now.getDate() - 1);
  }

  return toDateKey(now);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateKey(key: string): Date {
  const parts = key.split('-').map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day);
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

export function getPeriodDateKeys(daysBack: number, endKey?: string): string[] {
  const end = endKey ? fromDateKey(endKey) : fromDateKey(getTodayKey());
  const keys: string[] = [];

  for (let i = 0; i < daysBack; i++) {
    const date = new Date(end);
    date.setDate(date.getDate() - i);
    keys.push(toDateKey(date));
  }

  return keys;
}
