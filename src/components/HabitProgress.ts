import { HABIT_TYPES, STATUS } from '../constants';
import { escapeHtml } from '../utils';
import type { Check, Habit } from '../core/types';

/**
 * Виджеты прогресса для привычек-счётчиков и привычек-таймеров (план 04, п. 0341–0345).
 *
 * — Счётчик: круговой индикатор прогресса + кнопки «+1» / «−1» (п. 0343)
 * — Таймер: запуск в один клик и обратный отсчёт (п. 0345)
 */

const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Счётчик: круг прогресса и кнопки шага.
 */
export function renderCounterControl(habit: Habit, check: Check | undefined): string {
  const target = Math.max(1, habit.targetValue ?? 8);
  const step = Math.max(1, habit.stepValue ?? 1);
  const value = check?.value ?? 0;
  const unit = habit.unit ?? 'раз';
  const ratio = Math.min(1, value / target);
  const offset = RING_CIRCUMFERENCE * (1 - ratio);

  const done = check?.status === STATUS.FULL;

  return `
    <div class="habit-counter" data-counter-habit="${escapeHtml(habit.id)}">
      <div class="counter-ring-wrap" role="progressbar"
           aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.round(value)}"
           aria-label="Прогресс: ${value} из ${target} ${escapeHtml(unit)}">
        <svg viewBox="0 0 52 52" width="52" height="52" class="counter-ring" aria-hidden="true">
          <circle class="counter-ring-bg" cx="26" cy="26" r="${RING_RADIUS}"
                  fill="none" stroke-width="5" />
          <circle class="counter-ring-fg" cx="26" cy="26" r="${RING_RADIUS}"
                  fill="none" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
                  stroke-dashoffset="${offset.toFixed(2)}"
                  transform="rotate(-90 26 26)" />
        </svg>
        <span class="counter-ring-value">${value}</span>
      </div>

      <div class="counter-meta">
        <span class="counter-target">цель ${target} ${escapeHtml(unit)}</span>
        <span class="counter-step">шаг ${step}</span>
      </div>

      <div class="counter-actions">
        <button type="button" class="counter-btn tap-feedback" data-counter-step="-${step}"
                aria-label="Уменьшить на ${step}">−</button>
        <button type="button" class="counter-btn counter-btn--primary tap-feedback" data-counter-step="${step}"
                aria-label="Увеличить на ${step}">+${step}</button>
        <button type="button" class="habit-action-btn tap-feedback ${done ? 'primary' : ''}"
                data-action="full" aria-pressed="${done}">Норма</button>
      </div>
    </div>
  `;
}

/**
 * Таймер: кнопка запуска в один клик и живой обратный отсчёт.
 */
export function renderTimerControl(habit: Habit, check: Check | undefined): string {
  const minutes = Math.max(1, habit.timerMinutes ?? 20);
  const done = check?.status === STATUS.FULL;

  return `
    <div class="habit-timer" data-timer-habit="${escapeHtml(habit.id)}">
      <div class="timer-display" data-timer-display="${escapeHtml(habit.id)}" aria-live="polite">
        <span class="timer-digits" data-timer-digits="${escapeHtml(habit.id)}">${String(minutes).padStart(2, '0')}:00</span>
        <span class="timer-label">из ${minutes} мин</span>
      </div>
      <div class="timer-actions">
        <button type="button" class="habit-action-btn timer-start-btn tap-feedback"
                data-timer-start="${escapeHtml(habit.id)}">Старт</button>
        <button type="button" class="habit-action-btn tap-feedback ${done ? 'primary' : ''}"
                data-action="full" aria-pressed="${done}">Норма</button>
      </div>
    </div>
  `;
}

/**
 * Возвращает разметку блока действий привычки с учётом её типа механики.
 */
export function renderHabitActionBlock(habit: Habit, check: Check | undefined): string {
  if (habit.type === HABIT_TYPES.COUNTER) {
    return renderCounterControl(habit, check);
  }
  if (habit.type === HABIT_TYPES.TIMER) {
    return renderTimerControl(habit, check);
  }
  return '';
}

/**
 * Форматирует остаток времени в мм:сс.
 */
export function formatTimerRemain(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
