import './styles/main.css';
import { telegram } from './telegram';
import { storage } from './storage';
import { getTodayKey, formatDate, fromDateKey } from './date';
import { escapeHtml } from './utils';

class App {
  private currentTab = 'today';
  
  constructor() {
    this.init();
  }

  private init(): void {
    // Инициализация Telegram WebApp
    console.log('Telegram WebApp available:', telegram.isAvailable());
    const user = telegram.getUser();
    if (user) {
      console.log('User:', user);
    }

    // Обновляем дату в заголовке
    this.updateHeaderDate();
    
    // Подписываемся на изменения состояния
    storage.subscribe(() => {
      this.render();
    });

    // Настраиваем навигацию
    this.setupNavigation();
    
    // Настраиваем кнопку добавления привычки
    this.setupAddHabitButton();
    
    // Первый рендер
    this.render();
  }

  private updateHeaderDate(): void {
    const dateLabel = document.getElementById('headerDateLabel');
    if (!dateLabel) return;
    
    const today = fromDateKey(getTodayKey());
    dateLabel.textContent = formatDate(today);
  }

  private setupNavigation(): void {
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    const navPill = document.querySelector('.nav-slider-pill') as HTMLElement;
    
    navButtons.forEach((btn) => {
      const button = btn as HTMLElement;
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (!tab) return;
        
        telegram.haptic('light');
        this.switchTab(tab);
        
        // Обновляем активную кнопку
        navButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
        
        // Анимируем pill
        if (navPill) {
          const rect = button.getBoundingClientRect();
          const parentRect = button.parentElement!.getBoundingClientRect();
          const left = rect.left - parentRect.left;
          
          navPill.style.width = `${rect.width}px`;
          navPill.style.height = `${rect.height}px`;
          navPill.style.transform = `translateX(${left}px)`;
        }
      });
    });
    
    // Инициализируем позицию pill
    const activeBtn = document.querySelector('.nav-tab-btn.active') as HTMLElement;
    if (activeBtn && navPill) {
      const rect = activeBtn.getBoundingClientRect();
      const parentRect = activeBtn.parentElement!.getBoundingClientRect();
      const left = rect.left - parentRect.left;
      
      navPill.style.width = `${rect.width}px`;
      navPill.style.height = `${rect.height}px`;
      navPill.style.transform = `translateX(${left}px)`;
    }
  }

  private switchTab(tab: string): void {
    this.currentTab = tab;
    
    // Обновляем заголовок
    const heading = document.getElementById('pageHeading');
    if (heading) {
      const titles: Record<string, string> = {
        today: 'Сегодня',
        rituals: 'Ритуалы',
        analytics: 'Анализ',
        mastery: 'Мастерство',
        settings: 'Опции'
      };
      heading.textContent = titles[tab] ?? 'Дневник привычек';
    }
    
    this.render();
  }

  private setupAddHabitButton(): void {
    const btn = document.getElementById('addHabitBtn');
    if (!btn) return;
    
    btn.addEventListener('click', () => {
      telegram.haptic('medium');
      this.showAddHabitDialog();
    });
  }

  private showAddHabitDialog(): void {
    // Временно показываем alert, позже заменим на красивую модалку
    const title = prompt('Название привычки:');
    if (!title) return;
    
    const icon = prompt('Иконка (эмодзи):', '✨') ?? '✨';
    const sphere = prompt('Сфера (Тело/Разум/Дело/Дух):', 'Дело');
    const trigger = prompt('Триггер (когда делаешь):', '') ?? '';
    
    storage.addHabit({
      title,
      icon,
      sphere: sphere as any,
      type: 'binary',
      trigger,
      norm: 'Выполнено',
      planB: 'Минимум',
      keystone: false,
      incognito: false,
      capsule: ''
    });
    
    this.showIsland('Привычка добавлена ✓');
  }

  private render(): void {
    const container = document.getElementById('carouselPages');
    if (!container) return;
    
    // Пока рендерим только страницу "Сегодня"
    if (this.currentTab === 'today') {
      this.renderTodayPage(container);
    } else {
      container.innerHTML = `
        <div class="page">
          <div class="empty-state">
            <div class="empty-state-icon">🚧</div>
            <div class="empty-state-text">Раздел "${this.currentTab}" в разработке</div>
          </div>
        </div>
      `;
    }
  }

  private renderTodayPage(container: HTMLElement): void {
    const habits = storage.getHabits();
    const todayKey = getTodayKey();
    
    if (habits.length === 0) {
      container.innerHTML = `
        <div class="page">
          <div class="empty-state">
            <div class="empty-state-icon">🌱</div>
            <div class="empty-state-text">
              Добавь первую привычку, чтобы начать формировать новый образ жизни
            </div>
          </div>
        </div>
      `;
      return;
    }
    
    const habitCards = habits.map(habit => {
      const check = storage.getCheck(habit.id, todayKey);
      const isCompleted = check?.status === 'full' || check?.status === 'plan_b';
      
      return `
        <div class="habit-card" data-habit-id="${habit.id}">
          <div class="habit-card-header">
            <div class="habit-icon" aria-hidden="true">${escapeHtml(habit.icon)}</div>
            <div class="habit-info">
              <div class="habit-title">${escapeHtml(habit.title)}</div>
              ${habit.trigger ? `<div class="habit-trigger">${escapeHtml(habit.trigger)}</div>` : ''}
            </div>
          </div>
          
          <div class="habit-actions">
            <button type="button" class="habit-action-btn" data-action="planb" ${isCompleted ? 'disabled' : ''}>
              План Б
            </button>
            <button type="button" class="habit-action-btn primary" data-action="full" ${isCompleted ? 'disabled' : ''}>
              ${habit.norm}
            </button>
            <button type="button" class="habit-action-btn danger" data-action="skip" ${isCompleted ? 'disabled' : ''}>
              Пропуск
            </button>
          </div>
          
          ${isCompleted ? `
            <div class="habit-completed">
              <span class="streak-badge">✓ Выполнено</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    
    container.innerHTML = `
      <div class="page">
        ${habitCards}
      </div>
    `;
    
    // Настраиваем обработчики для кнопок
    this.setupHabitActions();
  }

  private setupHabitActions(): void {
    const buttons = document.querySelectorAll('.habit-action-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = e.currentTarget as HTMLElement;
        const card = button.closest('.habit-card') as HTMLElement;
        const habitId = card?.dataset.habitId;
        const action = button.dataset.action;
        
        if (!habitId || !action) return;
        
        telegram.haptic('medium');
        
        const todayKey = getTodayKey();
        const status = action === 'full' ? 'full' : action === 'planb' ? 'plan_b' : 'skip';
        
        storage.setCheck(habitId, todayKey, {
          status: status as any,
          ts: Date.now()
        });
        
        this.showIsland('Отметка сохранена ✓');
      });
    });
  }

  private showIsland(message: string): void {
    const island = document.getElementById('dynamicIsland');
    if (!island) return;
    
    island.textContent = message;
    island.classList.add('show');
    
    setTimeout(() => {
      island.classList.remove('show');
    }, 2000);
  }
}

// Запускаем приложение
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
