import { storage } from '../storage';
import { telegram } from '../telegram';
import { escapeHtml } from '../utils';

export function getSettingsHTML(): string {
  const state = storage.getState();
  const user = telegram.getUser();
  const userLine = user
    ? `${escapeHtml(user.first_name)}${user.username ? ` (@${escapeHtml(user.username)})` : ''}`
    : 'Локальный режим (без Telegram)';

  return `
    <div class="settings-view">
      <div class="section-card">
        <h3 class="section-title">Профиль</h3>
        <div class="settings-row">
          <span>Пользователь</span>
          <span class="settings-value">${userLine}</span>
        </div>
        <div class="settings-row">
          <span>Граница суток (час)</span>
          <select id="dayBoundarySelect" class="settings-select">
            ${[0, 1, 2, 3, 4, 5, 6]
              .map(
                (h) =>
                  `<option value="${h}" ${state.settings.dayBoundaryHour === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`
              )
              .join('')}
          </select>
        </div>
      </div>

      <div class="section-card">
        <h3 class="section-title">Корзина</h3>
        <div class="settings-row">
          <span>Срок хранения (дней)</span>
          <select id="trashRetentionSelect" class="settings-select">
            ${[7, 14, 30, 60, 90].map(
              (d) =>
                `<option value="${d}" ${state.settings.trashRetentionDays === d ? 'selected' : ''}>${d}</option>`
            ).join('')}
          </select>
        </div>
        <label class="toggle-check-row" for="trashReadOnlyCheck">
          <div>
            <div style="font-weight:700; color:var(--text-primary);">Только чтение</div>
            <div class="settings-desc">Скрыть восстановление и удаление в корзине</div>
          </div>
          <input type="checkbox" id="trashReadOnlyCheck" ${state.settings.trashReadOnly ? 'checked' : ''}>
        </label>
      </div>

      <div class="section-card">
        <h3 class="section-title">Данные и резервная копия</h3>
        <div class="habit-actions">
          <button type="button" class="habit-action-btn" id="exportJsonBtn">Экспорт JSON</button>
          <button type="button" class="habit-action-btn" id="importJsonBtn">Импорт JSON</button>
        </div>
        <div class="habit-actions">
          <button type="button" class="habit-action-btn danger" id="resetDataBtn">Сбросить всё</button>
        </div>
      </div>

      <div class="section-card">
        <div class="settings-desc">Версия прототипа: 0.2.0 • Данные хранятся локально в устройстве (+ настройки в CloudStorage Telegram).</div>
      </div>
    </div>
  `;
}
