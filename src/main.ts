import { storage } from './storage';
import { renderTodayPageHTML } from './components/TodayPage';
import { renderArchiveView } from './components/ArchiveView';
import { renderTrashView, TrashController } from './components/TrashView';
import { renderProfileView } from './components/ProfileView';
import { getAnalyticsHTML } from './components/AnalyticsView';
import { getHabitFormHTML, bindHabitFormModal } from './components/HabitForm';
import { SwipeManager } from './ui/gestures';
import { HabitActionController } from './controllers/HabitActionController';
import { LifecycleController } from './controllers/LifecycleController';
import { SettingsController } from './controllers/SettingsController';
import { RitualController } from './controllers/RitualController';
import { HabitDndController } from './controllers/HabitDndController';
import { ProgressController } from './controllers/ProgressController';
import { drawStackLine } from './animations/lifecycle';
import { telegram } from './telegram';
import { modalManager } from './ui/modal';
import { islandManager } from './ui/island';
import { animationManager, applyStagger, animateRestoreOut, animateCountUp } from './animations';

async function bootstrap() {
  await storage.whenReady();
  islandManager.bind();
  animationManager.bind();

  const app = document.getElementById('app');
  if (!app) return;

  // Каскадная анимация проигрывается один раз за сессию: последующие
  // перерисовки (после отметки) не должны проигрывать её заново.
  let staggerApplied = false;
  
  // Текущая страница
  let currentPage = 'today';

  // Отмена предыдущей привязки счётчиков/таймеров при перерисовке ленты
  let progressAbort: AbortController | null = null;

  // Контроллер ритуалов (живёт на протяжении всей сессии: держит активную сессию)
  const ritualController = new RitualController(() => render());

  // Ripple-эффект нажатия — один делегированный слушатель на всё приложение
  const onTapFeedback = (e: PointerEvent): void => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tap-feedback');
    if (!target) return;
    target.classList.remove('is-tapping');
    // Перезапуск анимации: снятие и возврат класса в следующем кадре
    void target.offsetWidth;
    target.classList.add('is-tapping');
  };

  /**
   * Открывает модальную форму конструктора привычки.
   * Без habitId — создание новой, с habitId — редактирование существующей.
   */
  function openHabitForm(habitId?: string): void {
    modalManager.open(
      getHabitFormHTML(habitId),
      (container, signal) => {
        bindHabitFormModal(container, signal, habitId, (message) => {
          islandManager.show({ message, icon: '✨' });
          render();
        });
      }
    );
  }

  /**
   * Рисует линии связи между привычками, привязанными через Habit Stack.
   */
  function drawStackConnectors(list: HTMLElement): void {
    list.querySelectorAll('.stack-connector').forEach((el) => el.remove());
    list.querySelectorAll<HTMLElement>('.habit-swipe-wrapper[data-stack-target]').forEach((wrapper) => {
      const targetId = wrapper.dataset['stackTarget'];
      if (targetId) drawStackLine(list, targetId, wrapper.dataset['habitId'] ?? '');
    });
  }

  function getPageTitle(page: string): string {
    switch (page) {
      case 'today': return 'Дневник';
      case 'stats': return 'Аналитика';
      case 'profile': return 'Профиль';
      case 'archive': return 'Архив';
      case 'trash': return 'Корзина';
      case 'rituals': return 'Ритуалы';
      default: return 'Дневник';
    }
  }

  function renderPageContent(page: string): string {
    switch (page) {
      case 'today': return renderTodayPageHTML();
      case 'archive': return renderArchiveView();
      case 'trash': return renderTrashView();
      case 'rituals': return ritualController.render();
      case 'stats': return getAnalyticsHTML();
      case 'profile': return renderProfileView();
      default: return renderTodayPageHTML();
    }
  }

  function render() {
    const pageTitle = getPageTitle(currentPage);
    const pageContent = renderPageContent(currentPage);
    const showAddBtn = currentPage === 'today';
    const isSubPage = currentPage === 'archive' || currentPage === 'trash';

    app!.innerHTML = `
      <header class="ios-fixed-header">
        <div class="header-content">
          <h1 id="pageHeading">${pageTitle}</h1>
          ${showAddBtn ? '<button id="addHabitBtn" class="header-add-btn">＋</button>' : ''}
        </div>
      </header>
      <main id="mainContent" class="${isSubPage ? 'page-subpage page-subpage--${currentPage}' : ''}">${pageContent}</main>
      <nav class="ios-island-navbar">
        <button class="nav-tab-btn ${currentPage === 'today' ? 'active' : ''}" data-page="today">Дневник</button>
        <button class="nav-tab-btn ${currentPage === 'stats' ? 'active' : ''}" data-page="stats">Аналитика</button>
        <button class="nav-tab-btn ${currentPage === 'profile' ? 'active' : ''}" data-page="profile">Профиль</button>
      </nav>
      <div id="dynamicIsland" class="dynamic-island"></div>
      <div id="confettiCanvas"></div>
    `;

    // Кнопка «Назад» Telegram в корзине и архиве (п. 0395)
    if (isSubPage) {
      telegram.showBackButton(() => {
        currentPage = 'today';
        render();
      });
    } else {
      telegram.hideBackButton();
    }

    // Swipe gestures — только для страницы «Дневник»
    if (currentPage === 'today') {
      const list = document.querySelector('.habit-list') as HTMLElement;
      if (list) {
        new SwipeManager(list, {
          onSwipe: (id, dir) => {
            if (dir === 'right-long') HabitActionController.performFull(id);
            else if (dir === 'right-short') HabitActionController.performPlanB(id);
            else if (dir === 'left') HabitActionController.performSkip(id, 'Пропуск свайпом');
          }
        });

        // Каскадная анимация появления — только при первом рендере,
        // чтобы перерисовка после отметки не проигрывала анимацию заново
        if (!staggerApplied) {
          staggerApplied = true;
          const cards = Array.from(list.querySelectorAll<HTMLElement>('.habit-card'));
          applyStagger(cards, { stepMs: 45, maxItems: 10 });
        }

        // Drag-and-drop сортировка карточек
        HabitDndController.enable(list);

        // Счётчики и таймеры (п. 0341–0345)
        progressAbort?.abort();
        progressAbort = new AbortController();
        ProgressController.bind(list, progressAbort.signal);

        // Линии связи между привычками (Habit Stack)
        drawStackConnectors(list);
      }

      document.getElementById('addHabitBtn')?.addEventListener('click', () => {
        openHabitForm();
      });

      // Скроллер дат: переключение выбранного дня
      document.querySelectorAll<HTMLElement>('[data-date-key]').forEach((cell) => {
        cell.addEventListener('click', () => {
          const key = cell.dataset['dateKey'];
          if (key) {
            storage.setSelectedDateKey(key);
            render();
          }
        });
      });

      // Поиск по названию привычки
      const searchInput = document.querySelector<HTMLInputElement>('#habitSearchInput');
      searchInput?.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        document.querySelectorAll<HTMLElement>('.habit-swipe-wrapper').forEach((wrapper) => {
          const title = wrapper.querySelector<HTMLElement>('.habit-title')?.textContent?.toLowerCase() ?? '';
          const trigger = wrapper.querySelector<HTMLElement>('.habit-trigger')?.textContent?.toLowerCase() ?? '';
          const matched = !q || title.includes(q) || trigger.includes(q);
          wrapper.style.display = matched ? '' : 'none';
        });
      });

      // Щит дня: защита от «пропуска» дня без потери серии
      document.getElementById('shieldPillBtn')?.addEventListener('click', () => {
        const dateKey = storage.getSelectedDateKey();
        const result = storage.activateShieldForDate(dateKey);
        if (result.ok) {
          telegram.hapticNotification('success');
          islandManager.show({ message: 'Щит активирован — день защищён', icon: '🛡️' });
          render();
        } else {
          islandManager.show({
            message: result.reason ?? 'Щит недоступен',
            icon: '⚠️'
          });
        }
      });
    }

    // Кнопки отметки внутри карточки привычки
    document.querySelectorAll<HTMLElement>('.habit-card [data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest<HTMLElement>('[data-habit-id]');
        const habitId = card?.dataset['habitId'];
        if (!habitId) return;
        const action = btn.dataset['action'];
        if (action === 'full') HabitActionController.performFull(habitId);
        else if (action === 'planb') HabitActionController.performPlanB(habitId);
      });
    });

    // Открытие карточки привычки на редактирование (тап по заголовку)
    document.querySelectorAll<HTMLElement>('.habit-info').forEach((info) => {
      info.addEventListener('click', () => {
        const card = info.closest<HTMLElement>('[data-habit-id]');
        const habitId = card?.dataset['habitId'];
        if (habitId) openHabitForm(habitId);
      });
    });

    // Навигация между страницами
    document.querySelectorAll('.nav-tab-btn, [data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = (btn as HTMLElement).dataset.page || 'today';
        currentPage = page;
        render();
      });
    });

    // Обработка действий в архиве
    document.querySelectorAll('[data-action="unarchive"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = (btn as HTMLElement).dataset.habitId;
        if (habitId) {
          const card = btn.closest<HTMLElement>('.archived-habit-card');
          animateRestoreOut(card);
          window.setTimeout(() => {
            storage.archiveHabit(habitId, false);
            render();
          }, 200);
        }
      });
    });

    // Обработка действий в корзине
    document.querySelectorAll('[data-action="restore"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = (btn as HTMLElement).dataset.habitId;
        if (habitId) {
          const card = btn.closest<HTMLElement>('.deleted-habit-card');
          LifecycleController.restoreFromTrash(habitId, card);
          window.setTimeout(render, 260);
        }
      });
    });

    // Обработка действий в корзине
    document.querySelectorAll('[data-action="delete-forever"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = (btn as HTMLElement).dataset.habitId;
        if (habitId) {
          TrashController.deleteForever(habitId);
          render();
        }
      });
    });

    document.querySelector('[data-action="empty-trash"]')?.addEventListener('click', () => {
      if (confirm('Очистить корзину? Все привычки будут удалены безвозвратно.')) {
        TrashController.emptyTrash();
        render();
      }
    });

    // Ритуалы — страница с таймером шагов
    if (currentPage === 'rituals') {
      const ritualsRoot = document.querySelector<HTMLElement>('.rituals-view');
      if (ritualsRoot) {
        const ctrl = new AbortController();
        ritualController.bind(ritualsRoot, ctrl.signal);
      }
    }

    // Настройки (профиль): граница суток, экспорт, импорт, сброс
    const settingsRoot = document.querySelector<HTMLElement>('.settings-view');
    if (settingsRoot) {
      const ctrl = new AbortController();
      SettingsController.bind(settingsRoot, ctrl.signal, () => render());
    }

    // Пружинная анимация счётчиков в профиле (п. 0396)
    if (currentPage === 'profile') {
      document.querySelectorAll<HTMLElement>('[data-count-value]').forEach((el) => {
        const target = Number(el.dataset['countValue'] ?? '0');
        animateCountUp(el, target);
      });
    }

    // Контекстное меню привычки — по долгому нажатию на карточку
    if (currentPage === 'today') {
      bindHabitContextMenu();
    }
  }

  /**
   * Долгое нажатие (600 мс) на карточке привычки открывает меню жизненного цикла:
   * клонирование, архивация, перемещение в корзину.
   */
  function bindHabitContextMenu(): void {
    const LONG_PRESS_MS = 600;
    let timer: number | null = null;
    let pressTarget: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;

    const cancel = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      pressTarget = null;
    };

    document.querySelectorAll<HTMLElement>('.habit-card').forEach((card) => {
      card.addEventListener('pointerdown', (e: PointerEvent) => {
        // Игнорируем нажатия на интерактивных элементах внутри карточки
        if ((e.target as HTMLElement).closest('button')) return;
        startX = e.clientX;
        startY = e.clientY;
        pressTarget = card;
        timer = window.setTimeout(() => {
          const habitId = pressTarget?.dataset.habitId;
          if (habitId) {
            LifecycleController.openMenu(habitId, startX, startY);
            telegram.haptic('medium');
          }
          cancel();
        }, LONG_PRESS_MS);
      });

      card.addEventListener('pointermove', (e: PointerEvent) => {
        // Смещение пальца отменяет долгое нажатие
        if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
          cancel();
        }
      });

      card.addEventListener('pointerup', cancel);
      card.addEventListener('pointercancel', cancel);
      card.addEventListener('pointerleave', cancel);
    });
  }

  // Ripple-эффект нажатия — один делегированный слушатель на всё приложение
  app.addEventListener('pointerdown', onTapFeedback);

  storage.subscribe(() => render());
  render();
}

bootstrap();
