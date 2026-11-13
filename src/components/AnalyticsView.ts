import { storage } from '../storage';
import { getPeriodDateKeys, getTodayKey } from '../date';
import { STATUS } from '../constants';
import { escapeHtml } from '../utils';

export function getAnalyticsHTML(): string {
  const habits = storage.getHabits();
  const state = storage.getState();
  const todayKey = getTodayKey(state.settings.dayBoundaryHour);

  if (habits.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">Добавь привычки, чтобы увидеть статистику, спасённые дни и тепловую карту</div>
      </div>
    `;
  }

  const weekKeys = getPeriodDateKeys(7, todayKey);
  const monthKeys = getPeriodDateKeys(30, todayKey);
  const heatKeys = getPeriodDateKeys(84, todayKey).reverse(); // 12 недель компактно для прототипа

  let fullCount = 0;
  let planBCount = 0;
  let totalPossible = habits.length * monthKeys.length;

  for (const habit of habits) {
    for (const dateKey of monthKeys) {
      const check = state.checks.get(`${habit.id}_${dateKey}`);
      if (check?.status === STATUS.FULL) fullCount++;
      else if (check?.status === STATUS.PLAN_B) planBCount++;
    }
  }

  const successRate = totalPossible > 0 ? Math.round(((fullCount + planBCount) / totalPossible) * 100) : 0;

  let energySum = 0;
  let energyDays = 0;
  for (const dateKey of weekKeys) {
    const log = state.logs.get(dateKey);
    if (log && log.energy > 0) {
      energySum += log.energy;
      energyDays++;
    }
  }
  const avgEnergy = energyDays > 0 ? (energySum / energyDays).toFixed(1) : '—';

  const heatCells = heatKeys
    .map((dateKey) => {
      let done = 0;
      let hasPlanB = false;
      for (const h of habits) {
        const c = state.checks.get(`${h.id}_${dateKey}`);
        if (c?.status === STATUS.FULL) done++;
        else if (c?.status === STATUS.PLAN_B) {
          done++;
          hasPlanB = true;
        }
      }
      const ratio = habits.length > 0 ? done / habits.length : 0;
      const level = ratio === 0 ? 'empty' : ratio >= 0.8 && !hasPlanB ? 'high' : 'mid';
      return `<div class="heat-cell ${level}" title="${escapeHtml(dateKey)}: ${done}/${habits.length}"></div>`;
    })
    .join('');

  return `
    <div class="analytics-view">
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${successRate}%</div>
          <div class="metric-label">Успех за 30 дней</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${planBCount}</div>
          <div class="metric-label">Спасённых Планом Б</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${avgEnergy}</div>
          <div class="metric-label">Средняя энергия (7 дн.)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${state.checks.size}</div>
          <div class="metric-label">Всего отметок</div>
        </div>
      </div>

      <div class="section-card">
        <h3 class="section-title">Активность за 12 недель</h3>
        <div class="heatmap-grid">${heatCells}</div>
        <div class="heatmap-legend">
          <span><i class="dot empty"></i> Пусто</span>
          <span><i class="dot mid"></i> План Б / часть</span>
          <span><i class="dot high"></i> Норма</span>
        </div>
      </div>
    </div>
  `;
}
