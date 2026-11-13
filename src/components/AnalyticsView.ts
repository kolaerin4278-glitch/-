import { storage } from '../storage';

export function getAnalyticsHTML(): string {
  const habits = storage.getHabits();
  const checks = storage.getState().checks;
  
  // Простейший расчет: общее кол-во чек-инов
  const totalCheckins = checks.size;
  
  return `
    <div class="analytics-view">
      <h3>Аналитика</h3>
      <div class="metric-card">
        <div class="metric-value">${totalCheckins}</div>
        <div class="metric-label">Всего отметок</div>
      </div>
      <div class="heatmap">
        <p>Тепловая карта года (в разработке)</p>
        <div class="heatmap-grid">
           <!-- Здесь будет виртуализация 364 ячеек -->
        </div>
      </div>
    </div>
  `;
}
