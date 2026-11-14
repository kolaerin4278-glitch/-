import { HABIT_TYPES, type HabitType } from '../constants';

/**
 * Генератор «Плана Б» — правило двух минут (план 04, п. 0305, 0342).
 *
 * Идея: план Б должен быть настолько маленьким, чтобы выполнить его
 * было легче, чем не выполнить. Поэтому он всегда ≈ половине нормы,
 * но не меньше двух минут и не больше половины цели.
 */

export interface PlanBSource {
  readonly type: HabitType;
  readonly norm?: string;
  readonly targetValue?: number;
  readonly unit?: string;
  readonly timerMinutes?: number;
}

/** Минимальный порог плана Б — «правило двух минут». */
export const PLAN_B_MIN_MINUTES = 2;

/**
 * Автоматически рассчитывает план Б по типу привычки.
 */
export function generatePlanB(source: PlanBSource): string {
  if (source.type === HABIT_TYPES.COUNTER) {
    const target = source.targetValue ?? 8;
    const unit = source.unit ?? 'раз';
    const half = Math.max(1, Math.ceil(target / 2));
    return `${half} ${unit}`;
  }

  if (source.type === HABIT_TYPES.TIMER) {
    const minutes = source.timerMinutes ?? 15;
    const plan = Math.max(PLAN_B_MIN_MINUTES, Math.ceil(minutes / 5));
    return `${plan} мин`;
  }

  // Бинарная привычка: извлекаем число из нормы («20 страниц» → «2 страницы»).
  const fromNorm = halveFromNorm(source.norm);
  if (fromNorm) return fromNorm;

  return `Минимум ${PLAN_B_MIN_MINUTES} мин`;
}

/**
 * Пытается уменьшить числовую норму вдвое: «30 мин» → «15 мин», «20 стр.» → «10 стр.».
 */
export function halveFromNorm(norm: string | undefined): string | null {
  if (!norm) return null;

  const match = norm.trim().match(/^(\d+)\s*(.*)$/);
  if (!match) return null;

  const value = Number(match[1]);
  const suffix = (match[2] ?? '').trim();
  if (!Number.isFinite(value) || value <= 0) return null;

  const half = Math.max(1, Math.ceil(value / 2));
  return suffix ? `${half} ${suffix}` : String(half);
}

/**
 * Генерирует намерение реализации по сфере и типу привычки (п. 0304).
 */
export function generateTrigger(
  sphere: string,
  type: HabitType,
  title: string
): string {
  const shortTitle = title.trim() || 'эту привычку';

  switch (sphere) {
    case 'Тело':
      return `После пробуждения — ${shortTitle.toLowerCase()}`;
    case 'Разум':
      return `После первой чашки кофе — ${shortTitle.toLowerCase()}`;
    case 'Дело':
      return `После того как начну первый рабочий блок — ${shortTitle.toLowerCase()}`;
    case 'Дух':
      return `В момент первой паузы в дне — ${shortTitle.toLowerCase()}`;
    default:
      return type === HABIT_TYPES.BINARY
        ? `После того как встал с кровати — ${shortTitle.toLowerCase()}`
        : `В фиксированное время — ${shortTitle.toLowerCase()}`;
  }
}
