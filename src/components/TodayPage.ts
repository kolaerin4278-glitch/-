import { fromDateKey, formatDate, getTodayKey } from '../date';
import { escapeHtml } from '../utils';
import { storage } from '../storage';
import { computeStreak } from '../streak';
import { HABIT_TYPES, STATUS } from '../constants';
import { renderHabitActionBlock } from './HabitProgress';

export function renderTodayPageHTML(): string {
  const state = storage.getState();
  const dateKey = storage.getSelectedDateKey();
  const dateObj = fromDateKey(dateKey);
  const habits = storage.getHabits();

  const log = storage.getDayLog(dateKey);
  const streakMap = new Map<string, number>();
  for (const habit of habits) {
    streakMap.set(habit.id, computeStreak(habit, state.checks, state.logs, dateKey, state.settings.vacationUntil));
  }

  const doneCount = habits.filter((h) => {
    const s = state.checks.get(`${h.id}_${dateKey}`)?.status;
    return s === STATUS.FULL || s === STATUS.PLAN_B;
  }).length;
  const dayPct = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0;

  // Карта связей Habit Stack: id привычки → id привычки, которая выполняется после неё
  const stackTargets = new Map<string, string>();
  for (const h of habits) {
    if (h.stackAfterId && habits.some((x) => x.id === h.stackAfterId)) {
      stackTargets.set(h.stackAfterId, h.id);
    }
  }

  return `
    <div class="page" id="todayPage">
      <section class="day-hero" aria-label="Прогресс дня">
        <div><span class="eyebrow">МАЛЕНЬКИЕ ШАГИ · БОЛЬШИЕ ПЕРЕМЕНЫ</span>
          <h2>В своём ритме.</h2><p>${habits.length ? 'Не идеально. Просто немного лучше, чем вчера.' : 'Начни с одной привычки. Остальное придёт.'}</p>
          <span class="day-hero-caption">${doneCount} из ${habits.length} выполнено</span>
        </div>
        <div class="day-orbit" style="--day-progress:${dayPct}%"><span>${dayPct}<small>% дня</small></span></div>
      </section>
      <div class="today-toolbar">
        <div class="date-snap-scroller" id="dateSnapScroller">
          ${renderDateSnapper(dateKey)}
        </div>

        <div class="campfire-row">
          <button class="campfire-bar ${log?.shielded ? 'lit' : ''}" type="button">
            <div class="campfire-left">
              <span class="campfire-flame-svg">🔥</span>
              <div>
                <div class="campfire-title">Костёр дня</div>
                <div class="campfire-sub">${formatDate(dateObj)}</div>
              </div>
            </div>
            <div class="campfire-pct">${dayPct}%</div>
          </button>
          <button class="shield-pill-btn ${state.settings.shields > 0 ? '' : 'active-shield'}" id="shieldPillBtn"
                  aria-label="Щиты: ${state.settings.shields}">
             <span>🛡️</span>
             <span>${state.settings.shields}</span>
          </button>
        </div>
      </div>

      <div class="filter-search-row">
        <input type="text" class="search-inline-input" id="habitSearchInput" placeholder="Поиск привычки...">
      </div>

      <div class="list-heading"><h2>Твои привычки</h2><span>${habits.length ? 'Один шаг за раз' : 'Точка старта'}</span></div>
      ${habits.length === 0 ? `<section class="first-habit"><div class="first-habit-orb" aria-hidden="true">✦</div><h3>Здесь начинается твой ритм</h3><p>Вода утром, несколько страниц книги или минута тишины — выбери то, что важно тебе.</p><button type="button" class="habit-action-btn primary" data-create-habit>Создать первую привычку <span aria-hidden="true">↗</span></button></section>` : ''}
      <div class="habit-list" id="habitList">
        ${habits
          .map((h) => {
            const check = storage.getCheck(h.id, dateKey);
            const streak = streakMap.get(h.id) ?? 0;
            const stackTarget = stackTargets.get(h.id);
            const isStacked = Boolean(stackTarget);
            return `
              <div class="habit-swipe-wrapper ${isStacked ? 'has-stack' : ''}" data-habit-id="${h.id}" ${stackTarget ? `data-stack-target="${stackTarget}"` : ''}>
                <div class="swipe-backdrop"></div>
                <div class="habit-card tap-feedback ${h.keystone ? 'keystone-card' : ''}" data-habit-id="${h.id}">
                  <div class="habit-card-header">
                    <span class="habit-drag-handle" aria-hidden="true">⠿</span>
                    <div class="habit-icon" aria-hidden="true">${h.icon}</div>
                    <div class="habit-info">
                      <div class="habit-title-row">
                        <div class="habit-title">${escapeHtml(h.title)}</div>
                        <span class="habit-sphere-tag" data-sphere="${h.sphere}" aria-label="Сфера: ${h.sphere}">${h.sphere}</span>
                      </div>
                      <div class="habit-trigger">${escapeHtml(h.trigger)}</div>
                      ${streak > 0 ? `<div class="habit-streak" aria-label="Серия: ${streak} дн.">🔥 ${streak}</div>` : ''}
                      ${isStacked ? `<div class="habit-stack-link" aria-label="Связана с другой привычкой">🔗 связь</div>` : ''}
                    </div>
                  </div>
                  <div class="habit-actions">
                    ${renderHabitActionBlock(h, check)}
                    ${
                      h.type === HABIT_TYPES.COUNTER || h.type === HABIT_TYPES.TIMER
                        ? ''
                        : `
                    <button type="button" class="habit-action-btn tap-feedback ${check?.status === 'full' ? 'primary' : ''}"
                            data-action="full" aria-pressed="${check?.status === 'full'}">Норма</button>
                    <button type="button" class="habit-action-btn tap-feedback ${check?.status === 'plan_b' ? 'amber' : ''}"
                            data-action="planb" aria-pressed="${check?.status === 'plan_b'}">План Б</button>`
                    }
                  </div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      ${renderArchiveIndicator()}
    </div>
  `;
}

/**
 * Скроллер дат — горизонтальная лента последних 14 дней с «липкой» сегодняшней.
 */
function renderDateSnapper(activeKey: string): string {
  const state = storage.getState();
  const todayKey = getTodayKey(state.settings.dayBoundaryHour);
  const keys: string[] = [];
  const base = new Date(`${todayKey}T00:00:00`);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${day}`);
  }

  const cells = keys
    .map((key) => {
      const d = fromDateKey(key);
      const isActive = key === activeKey;
      const isToday = key === todayKey;
      const done = state.checks.size > 0 && [...state.checks.values()].some(
        (c) => c.date === key && (c.status === STATUS.FULL || c.status === STATUS.PLAN_B)
      );
      return `
        <button type="button" class="date-snap-cell ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}"
                data-date-key="${key}" aria-pressed="${isActive}">
          <span class="date-snap-weekday">${d.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
          <span class="date-snap-day">${d.getDate()}</span>
          <span class="date-snap-dot ${done ? 'done' : ''}"></span>
        </button>
      `;
    })
    .join('');

  return `<div class="date-snap-track">${cells}</div>`;
}

/**
 * Индикатор архивированных привычек в конце списка (план 04, п. 0366).
 * Показывает количество приостановленных привычек и ведёт в архив.
 */
function renderArchiveIndicator(): string {
  const archivedCount = storage.getArchivedHabits().length;
  if (archivedCount === 0) return '';

  return `
    <button type="button" class="archive-indicator tap-feedback" data-page="archive">
      <span class="archive-indicator-icon">📦</span>
      <span class="archive-indicator-label">
        Архив · ${archivedCount} ${archivedCount === 1 ? 'привычка' : archivedCount < 5 ? 'привычки' : 'привычек'}
      </span>
      <span class="archive-indicator-arrow">›</span>
    </button>
  `;
}
