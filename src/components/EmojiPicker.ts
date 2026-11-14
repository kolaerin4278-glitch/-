import { escapeHtml } from '../utils';

/**
 * Категоризированный пикер эмодзи и SVG-иконок (план 04, п. 0303).
 *
 * Иконки сгруппированы по категориям; пользователь может либо выбрать
 * эмодзи из палитры, либо ввести произвольный символ вручную.
 */

export interface EmojiCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly emojis: readonly string[];
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = Object.freeze([
  {
    id: 'body',
    label: 'Тело',
    icon: '💪',
    emojis: ['💧', '🏃', '🚶', '🚴', '🧘', '🤸', '🏋️', '💪', '🍎', '🥗', '😴', '🌙', '☀️', '🚿', '🦷']
  },
  {
    id: 'mind',
    label: 'Разум',
    icon: '🧠',
    emojis: ['📚', '✍️', '🧠', '🎓', '📖', '🗒️', '💡', '🧩', '🎯', '🔍', '🗣️', '🌍', '🎧', '📝', '💭']
  },
  {
    id: 'work',
    label: 'Дело',
    icon: '💼',
    emojis: ['💼', '📊', '📈', '💻', '📱', '🗂️', '⏰', '📌', '🧾', '💰', '🔧', '🏗️', '🚗', '📮', '⚙️']
  },
  {
    id: 'spirit',
    label: 'Дух',
    icon: '🕊️',
    emojis: ['🕊️', '✨', '🙏', '🌿', '🕯️', '🧘', '❤️', '🌸', '☮️', '🔮', '🪷', '🌻', '🎵', '🕯', '☕']
  }
]);

/**
 * Разметка пикера: вкладки категорий + активная сетка эмодзи.
 */
export function renderEmojiPickerHTML(selectedIcon: string): string {
  const active = EMOJI_CATEGORIES[0]!;

  return `
    <div class="emoji-picker" id="emojiPicker">
      <div class="emoji-picker-tabs" role="tablist" aria-label="Категории иконок">
        ${EMOJI_CATEGORIES.map(
          (cat, i) => `
            <button type="button" class="emoji-picker-tab ${i === 0 ? 'active' : ''}"
                    role="tab" aria-selected="${i === 0}"
                    data-emoji-cat="${escapeHtml(cat.id)}" title="${escapeHtml(cat.label)}">
              ${cat.icon}
            </button>
          `
        ).join('')}
      </div>

      <div class="emoji-picker-grid" id="emojiPickerGrid" role="group" aria-label="Иконки">
        ${active.emojis
          .map(
            (em) =>
              `<button type="button" class="emoji-pick-btn ${em === selectedIcon ? 'selected' : ''}" data-pick-emoji="${em}" aria-label="Выбрать ${em}">${em}</button>`
          )
          .join('')}
      </div>
    </div>
  `;
}

/**
 * Привязывает пикер к контейнеру модального окна.
 */
export function bindEmojiPicker(
  container: HTMLElement,
  signal: AbortSignal,
  onPick: (emoji: string) => void
): void {
  const grid = container.querySelector('#emojiPickerGrid');
  if (!grid) return;

  container.querySelectorAll<HTMLElement>('[data-emoji-cat]').forEach((tab) => {
    tab.addEventListener(
      'click',
      () => {
        const catId = tab.dataset['emojiCat'];
        const cat = EMOJI_CATEGORIES.find((c) => c.id === catId);
        if (!cat) return;

        container.querySelectorAll('[data-emoji-cat]').forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        grid.innerHTML = cat.emojis
          .map(
            (em) =>
              `<button type="button" class="emoji-pick-btn" data-pick-emoji="${em}" aria-label="Выбрать ${em}">${em}</button>`
          )
          .join('');

        bindGrid();
      },
      { signal }
    );
  });

  const bindGrid = (): void => {
    grid.querySelectorAll<HTMLElement>('[data-pick-emoji]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          grid.querySelectorAll('.emoji-pick-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          onPick(btn.dataset['pickEmoji'] ?? '✨');
        },
        { signal }
      );
    });
  };

  bindGrid();
}
