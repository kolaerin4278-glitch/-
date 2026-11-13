import { storage } from '../storage';
import { escapeHtml } from '../utils';
import type { Ritual } from '../types';

export interface ActiveRitualSession {
  ritual: Ritual;
  stepIndex: number;
  stepEndTimestamp: number;
  pausedRemainingMs: number | null;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getRitualsHTML(session: ActiveRitualSession | null): string {
  const rituals = storage.getRituals();

  const activePlayerHTML = session
    ? (() => {
        const currentStep = session.ritual.steps[session.stepIndex];
        const remainingMs =
          session.pausedRemainingMs !== null
            ? session.pausedRemainingMs
            : Math.max(0, session.stepEndTimestamp - Date.now());

        return `
          <div class="section-card ritual-player-card">
            <div class="ritual-player-head">
              <span>${escapeHtml(session.ritual.icon)} ${escapeHtml(session.ritual.title)}</span>
              <span class="streak-badge">Шаг ${session.stepIndex + 1} / ${session.ritual.steps.length}</span>
            </div>
            <div class="ritual-player-step">${escapeHtml(currentStep?.title ?? 'Завершено')}</div>
            <div id="ritualTimerDigits" class="ritual-timer-digits">${formatDuration(remainingMs)}</div>
            <div class="habit-actions">
              <button type="button" class="habit-action-btn" data-ritual-action="toggle-pause">
                ${session.pausedRemainingMs !== null ? 'Продолжить' : 'Пауза'}
              </button>
              <button type="button" class="habit-action-btn primary" data-ritual-action="next-step">
                Следующий шаг
              </button>
              <button type="button" class="habit-action-btn danger" data-ritual-action="stop">
                Стоп
              </button>
            </div>
          </div>
        `;
      })()
    : '';

  const listHTML =
    rituals.length === 0
      ? `
      <div class="empty-state">
        <div class="empty-state-icon">🔗</div>
        <div class="empty-state-text">
          Создай цепочку шагов (например: Утренний старт) и запускай с таймером, который не сбивается при блокировке экрана
        </div>
        <button type="button" class="habit-action-btn primary" id="addDefaultRitualBtn">
          Добавить утренний ритуал (3 шага)
        </button>
      </div>
    `
      : rituals
          .map((ritual) => {
            const totalMin = ritual.steps.reduce((sum, s) => sum + s.minutes, 0);
            const stepsList = ritual.steps
              .map((s) => `<li class="ritual-step-line">${escapeHtml(s.title)} · ${s.minutes} мин</li>`)
              .join('');

            return `
              <div class="section-card">
                <div class="habit-card-header">
                  <div class="habit-icon" aria-hidden="true">${escapeHtml(ritual.icon)}</div>
                  <div class="habit-info">
                    <div class="habit-title">${escapeHtml(ritual.title)}</div>
                    <div class="habit-trigger">${ritual.steps.length} шага • ${totalMin} мин</div>
                  </div>
                </div>
                <ul class="ritual-steps-list">${stepsList}</ul>
                <div class="habit-actions">
                  <button type="button" class="habit-action-btn primary" data-start-ritual="${escapeHtml(ritual.id)}">
                    ▶ Запустить
                  </button>
                  <button type="button" class="habit-action-btn danger" data-delete-ritual="${escapeHtml(ritual.id)}">
                    Удалить
                  </button>
                </div>
              </div>
            `;
          })
          .join('');

  return `
    <div class="rituals-view">
      ${activePlayerHTML}
      <div class="section-actions-top">
        <button type="button" class="habit-action-btn" id="createRitualBtn">+ Новый ритуал</button>
      </div>
      ${listHTML}
    </div>
  `;
}
