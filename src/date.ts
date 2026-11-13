import { DAY_BOUNDARY_HOUR } from './constants';

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat('ru-RU', options));
  }
  return formatters.get(key)!;
}

export function getTodayKey(): string {
  const now = new Date();
  const hour = now.getHours();
  
  // Если час меньше границы суток, считаем это вчерашним днем
  if (hour < DAY_BOUNDARY_HOUR) {
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
  const year = parts[0] ?? 2024;
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
  
  return formatter.format(date);
}

export function getPeriodDateKeys(period: 'week' | 'month' | 'all', endDate?: Date): string[] {
  const end = endDate ?? new Date();
  const keys: string[] = [];
  
  let daysBack = 0;
  if (period === 'week') daysBack = 7;
  else if (period === 'month') daysBack = 30;
  else daysBack = 365; // Для 'all' берём год
  
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(end);
    date.setDate(date.getDate() - i);
    keys.push(toDateKey(date));
  }
  
  return keys;
}
