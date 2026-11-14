import { storage } from '../storage';
import { SPHERE_META, type Sphere } from '../constants';
import { getSettingsHTML } from './SettingsView';
import { analyzeStack, formatStackChain } from '../core/stack';
import { escapeHtml } from '../utils';

/**
 * Экран профиля: сводка по привычкам, доступ к архиву, корзине и настройкам.
 */

export function renderProfileView(): string {
  const state = storage.getState();
  const active = storage.getHabits();
  const archived = storage.getArchivedHabits();
  const deleted = storage.getDeletedHabits();
  const ritualsCount = storage.getRituals().length;

  let totalChecks = 0;
  for (const check of state.checks.values()) {
    if (check.status === 'full' || check.status === 'plan_b') totalChecks += 1;
  }

  const sphereCounts = new Map<Sphere, number>();
  for (const h of active) {
    sphereCounts.set(h.sphere, (sphereCounts.get(h.sphere) ?? 0) + 1);
  }

  return `
    <div class="profile-view">
      <section class="profile-hero glass-card">
        <div class="profile-hero-avatar">🧘</div>
        <div class="profile-hero-stats">
          <div class="profile-hero-stat">
            <div class="profile-hero-stat-value" data-count-value="${active.length}">0</div>
            <div class="profile-hero-stat-label">активных</div>
          </div>
          <div class="profile-hero-stat">
            <div class="profile-hero-stat-value" data-count-value="${totalChecks}">0</div>
            <div class="profile-hero-stat-label">отметок</div>
          </div>
          <div class="profile-hero-stat">
            <div class="profile-hero-stat-value" data-count-value="${archived.length}">0</div>
            <div class="profile-hero-stat-label">в архиве</div>
          </div>
        </div>
      </section>

      <section class="profile-section">
        <h2 class="profile-section-title">Сферы</h2>
        <div class="profile-spheres">
          ${(Object.keys(SPHERE_META) as Sphere[]).map((sphere) => {
            const meta = SPHERE_META[sphere];
            const count = sphereCounts.get(sphere) ?? 0;
            return `
              <div class="profile-sphere" data-sphere="${sphere}" style="--sphere-color: ${meta.color}; --sphere-glow: ${meta.glow}">
                <div class="profile-sphere-count">${count}</div>
                <div class="profile-sphere-name">${sphere}</div>
                <div class="profile-sphere-badge">${meta.badge}</div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <section class="profile-section">
        <h2 class="profile-section-title">Карта активности</h2>
        ${renderHeatmap(state.checks)}
      </section>

      <section class="profile-section">
        <h2 class="profile-section-title">Цепочки привычек</h2>
        ${renderStackChains(active)}
      </section>

      <section class="profile-section">
        <h2 class="profile-section-title">Управление</h2>
        <div class="profile-links">
          <button type="button" class="profile-link tap-feedback" data-page="archive">
            <span class="profile-link-icon">📦</span>
            <span class="profile-link-text">
              <span class="profile-link-title">Архив</span>
              <span class="profile-link-subtitle">Приостановленные привычки</span>
            </span>
            <span class="profile-link-count">${archived.length}</span>
            <span class="profile-link-arrow">›</span>
          </button>

          <button type="button" class="profile-link tap-feedback" data-page="rituals">
            <span class="profile-link-icon">🔗</span>
            <span class="profile-link-text">
              <span class="profile-link-title">Ритуалы</span>
              <span class="profile-link-subtitle">Цепочки шагов с таймером</span>
            </span>
            <span class="profile-link-count">${ritualsCount}</span>
            <span class="profile-link-arrow">›</span>
          </button>

          <button type="button" class="profile-link tap-feedback" data-page="trash">
            <span class="profile-link-icon">🗑️</span>
            <span class="profile-link-text">
              <span class="profile-link-title">Корзина</span>
              <span class="profile-link-subtitle">Удалённые привычки</span>
            </span>
            <span class="profile-link-count">${deleted.length}</span>
            <span class="profile-link-arrow">›</span>
          </button>
        </div>
      </section>

      <section class="profile-section">
        <h2 class="profile-section-title">Настройки</h2>
        ${getSettingsHTML()}
      </section>
    </div>
  `;
}

/**
 * Интерактивная тепловая карта выполнения привычек (п. 0385).
 * Показывает активность за последние 26 недель в стиле GitHub Contributions.
 */
function renderHeatmap(checks: ReadonlyMap<string, import('../core/types').Check>): string {
  const DAYS = 26 * 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Считаем выполнения по каждой дате
  const counts = new Map<string, number>();
  for (const check of checks.values()) {
    if (check.status !== 'full' && check.status !== 'plan_b') continue;
    counts.set(check.date, (counts.get(check.date) ?? 0) + 1);
  }

  const start = new Date(today);
  start.setDate(start.getDate() - (DAYS - 1));
  const startWeekday = (start.getDay() + 6) % 7;
  const weeks = Math.ceil((startWeekday + DAYS) / 7);
  const cells: string[] = [];
  let totalDays = 0;
  for (let i = 0; i < DAYS; i += 1) {
    // Календарная арифметика не пропускает и не повторяет даты при смене часового пояса/DST.
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const count = counts.get(key) ?? 0;
    const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
    const dow = (d.getDay() + 6) % 7; // 0 = Пн
    const week = Math.floor((startWeekday + i) / 7);
    if (count > 0) totalDays += 1;
    const title = `${d.toLocaleDateString('ru-RU')}: ${count} ${plural(count, 'выполнение', 'выполнения', 'выполнений')}`;
    cells.push(
      `<div class="heatmap-cell" data-level="${level}" style="grid-column:${week + 1}; grid-row:${dow + 1};" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"></div>`
    );
  }
  return `
    <div class="heatmap-wrap">
      <div class="heatmap-grid" style="grid-template-columns:repeat(${weeks}, 12px); grid-template-rows:repeat(7, 12px); min-width:0; max-width:100%;" role="img" aria-label="Тепловая карта выполнения привычек за последние 26 недель">
        ${cells.join('')}
      </div>
      <div class="heatmap-legend">
        <span>Меньше</span>
        ${[0, 1, 2, 3, 4].map((l) => `<div class="heatmap-cell" data-level="${l}"></div>`).join('')}
        <span>Больше</span>
      </div>
      <div class="heatmap-summary">Активных дней: ${totalDays}</div>
    </div>
  `;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Визуализация цепочек Habit Stacking в профиле (п. 0382)
 * вместе с индикатором сложности цепочки (п. 0398).
 */
function renderStackChains(active: readonly import('../core/types').Habit[]): string {
  // Корни цепочек — привычки, к которым не привязана другая привычка
  const hasParent = new Set(active.map((h) => h.stackAfterId).filter(Boolean));
  const roots = active.filter((h) => !hasParent.has(h.id));

  const chains = roots
    .map((root) => analyzeStack(root.id, active))
    .filter((a) => a.length > 1);

  if (chains.length === 0) {
    return `
      <div class="page-placeholder">
        Цепочек пока нет.<br>
        Свяжите привычки в конструкторе — и они выполнятся друг за другом.
      </div>
    `;
  }

  return `
    <div class="stack-chains">
      ${chains
        .map(
          (a) => `
            <div class="stack-chain stack-chain--${a.level}">
              <div class="stack-chain-head">
                <span class="stack-chain-level" data-level="${a.level}">
                  ${a.level === 'hard' ? '⚠️ сложная' : a.level === 'medium' ? '⚡ средняя' : '✓ лёгкая'}
                </span>
                <span class="stack-chain-energy">${a.totalEnergy}⚡ · ${a.length} звена</span>
              </div>
              <div class="stack-chain-path">${escapeHtml(formatStackChain(a.chain))}</div>
              ${a.warning ? `<div class="stack-chain-warning">${escapeHtml(a.warning)}</div>` : ''}
            </div>
          `
        )
        .join('')}
    </div>
  `;
}
