import { storage } from './storage';
import { renderTodayPageHTML } from './components/TodayPage';
import { SwipeManager } from './ui/gestures';
import { HabitActionController } from './controllers/HabitActionController';
import { telegram } from './telegram';
import { modalManager } from './ui/modal';
import { islandManager } from './ui/island';

async function bootstrap() {
  await storage.whenReady();
  islandManager.bind();

  const app = document.getElementById('app');
  if (!app) return;

  function render() {
    app!.innerHTML = `
      <header class="ios-fixed-header">
        <div class="header-content">
          <h1 id="pageHeading">Дневник</h1>
          <button id="addHabitBtn" class="header-add-btn">＋</button>
        </div>
      </header>
      <main id="mainContent">${renderTodayPageHTML()}</main>
      <nav class="ios-island-navbar">
        <button class="nav-tab-btn active" data-page="today">Дневник</button>
        <button class="nav-tab-btn" data-page="stats">Аналитика</button>
        <button class="nav-tab-btn" data-page="profile">Профиль</button>
      </nav>
      <div id="dynamicIsland" class="dynamic-island"></div>
      <div id="confettiCanvas"></div>
    `;

    // Swipe gestures
    const list = document.querySelector('.habit-list') as HTMLElement;
    if (list) {
      new SwipeManager(list, {
        onSwipe: (id, dir) => {
          if (dir === 'right-long') HabitActionController.performFull(id);
          else if (dir === 'right-short') HabitActionController.performPlanB(id);
          else if (dir === 'left') HabitActionController.performSkip(id, 'Пропуск свайпом');
        }
      });
    }

    document.getElementById('addHabitBtn')?.addEventListener('click', () => {
        modalManager.open(
          `<div>Form content...</div>`, 
          (cont) => { /* bindHabitFormModal(cont, ...) */ }
        );
    });
  }

  storage.subscribe(() => render());
  render();
}

bootstrap();
