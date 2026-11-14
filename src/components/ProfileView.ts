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
            <div class="profile-hero-stat-value">${active.length}</div>
            <div class="profile-hero-stat-label">активных</div>
          </div>
          <div class="profile-hero-stat">
            <div class="profile-hero-stat-value">${totalChecks}</div>
            <div class="profile-hero-stat-label">отметок</div>
          </div>
          <div class="profile-hero-stat">
            <div class="profile-hero-stat-value">${archived.length}</div>
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
