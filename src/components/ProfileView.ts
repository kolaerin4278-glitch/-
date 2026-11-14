import { storage } from '../storage';
import { SPHERE_META, type Sphere } from '../constants';
import { getSettingsHTML } from './SettingsView';

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
