import { SPHERES } from '../constants';
import { fromDateKey, formatDate } from '../date';
import { storage } from '../storage';

export function renderTodayPageHTML(): string {
  const state = storage.getState();
  const dateKey = storage.getSelectedDateKey();
  const dateObj = fromDateKey(dateKey);
  const habits = storage.getHabits();
  
  const log = storage.getDayLog(dateKey);
  const streakMap = new Map<string, number>(); // Здесь должна быть логика из streak.ts
  
  return `
    <div class="page" id="todayPage">
      <div class="today-toolbar">
        <div class="date-snap-scroller">
          <!-- TODO: Скроллер дат (План 05) -->
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
            <div class="campfire-pct">0%</div>
          </button>
          <button class="shield-pill-btn ${state.settings.shields > 0 ? '' : 'active-shield'}">
             <span>🛡️</span>
             <span>${state.settings.shields}</span>
          </button>
        </div>
      </div>
      
      <div class="filter-search-row">
        <input type="text" class="search-inline-input" placeholder="Поиск привычки...">
      </div>

      <div class="habit-list">
        ${habits
          .map((h) => {
            const check = storage.getCheck(h.id, dateKey);
            const streak = streakMap.get(h.id) ?? 0;
            return `
              <div class="habit-swipe-wrapper" data-habit-id="${h.id}">
                <div class="swipe-backdrop"></div>
                <div class="habit-card" data-habit-id="${h.id}">
                  <div class="habit-card-header">
                    <div class="habit-icon">${h.icon}</div>
                    <div class="habit-info">
                      <div class="habit-title-row">
                        <div class="habit-title">${h.title}</div>
                        <span class="habit-sphere-tag" data-sphere="${h.sphere}">${h.sphere}</span>
                      </div>
                      <div class="habit-trigger">${h.trigger}</div>
                    </div>
                  </div>
                  <div class="habit-actions">
                    <button class="habit-action-btn ${check?.status === 'full' ? 'primary' : ''}" 
                            data-action="full">Норма</button>
                    <button class="habit-action-btn ${check?.status === 'plan_b' ? 'amber' : ''}" 
                            data-action="planb">План Б</button>
                  </div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}
