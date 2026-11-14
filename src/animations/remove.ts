import { lifecycle } from '../core/lifecycle';

/**
 * Плавная анимация удаления элемента из списка:
 * высота схлопывается до 0, остальные элементы плавно «съезжают» на освобождённое место.
 * Исключает визуальные «скачки» интерфейса.
 */
export function animateRemove(element: HTMLElement): Promise<void> {
  if (lifecycle.prefersReducedMotion() || !element) {
    element?.remove();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const initialHeight = element.offsetHeight;
    const initialOpacity = getComputedStyle(element).opacity;

    const keyframes = [
      {
        height: `${initialHeight}px`,
        opacity: initialOpacity,
        transform: 'translateX(0)',
        marginBottom: getComputedStyle(element).marginBottom
      },
      {
        height: '0px',
        opacity: '0',
        transform: 'translateX(24px)',
        marginBottom: '0px'
      }
    ];

    const timing: KeyframeAnimationOptions = {
      duration: 280,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards'
    };

    const anim = element.animate(keyframes, timing);
    anim.onfinish = () => {
      element.remove();
      resolve();
    };
  });
}

/**
 * Анимация FLIP (First, Last, Invert, Play) для бесшовной перестановки элементов.
 * Позволяет пользователю отслеживать движение карточек при сортировке.
 */
export function animateFlip(
  elements: readonly HTMLElement[],
  mutate: () => void
): void {
  if (lifecycle.prefersReducedMotion() || elements.length === 0) {
    mutate();
    return;
  }

  // First — записываем исходные позиции
  const firstRects = new Map<HTMLElement, DOMRect>();
  for (const el of elements) {
    firstRects.set(el, el.getBoundingClientRect());
  }

  // Last + Invert — применяем мутацию и измеряем новые позиции
  mutate();

  // Play — запускаем обратную анимацию
  for (const el of elements) {
    const first = firstRects.get(el);
    const last = el.getBoundingClientRect();
    if (!first) continue;

    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

    el.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: 'translate(0, 0)' }
      ],
      {
        duration: 340,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      }
    );
  }
}
