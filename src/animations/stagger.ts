import { lifecycle } from '../core/lifecycle';

/**
 * Каскадное (staggered) появление элементов списка.
 * Снижает когнитивную нагрузку при первом открытии экрана,
 * задавая предсказуваемую структуру восприятия.
 */

export interface StaggerOptions {
  /** Задержка между соседними элементами, мс */
  readonly stepMs?: number;
  /** Максимальное число элементов, участвующих в каскаде */
  readonly maxItems?: number;
  /** Начальная задержка, мс */
  readonly initialDelayMs?: number;
  readonly reduceMotionOverride?: boolean;
}

const DEFAULT_STEP_MS = 50;
const DEFAULT_MAX_ITEMS = 12;

/**
 * Применяет каскадную анимацию появления к элементам списка.
 * Задержка вычисляется в CSS из `--stagger-idx` и `--stagger-step`,
 * поэтому не требует таймеров на каждый элемент.
 */
export function applyStagger(
  elements: readonly HTMLElement[],
  options: StaggerOptions = {}
): () => void {
  const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const initialDelayMs = options.initialDelayMs ?? 0;
  const reduce = options.reduceMotionOverride ?? false;

  if (lifecycle.prefersReducedMotion(reduce)) {
    for (const el of elements) {
      el.style.setProperty('--stagger-idx', '0');
      el.classList.add('stagger-item');
    }
    return () => undefined;
  }

  const items = elements.slice(0, maxItems);

  for (const el of items) {
    el.style.setProperty('--stagger-step', `${stepMs}ms`);
    el.style.setProperty('--stagger-delay', `${initialDelayMs}ms`);
  }

  items.forEach((el, index) => {
    el.style.setProperty('--stagger-idx', String(index));
    el.classList.add('stagger-item');
  });

  return () => {
    for (const el of items) {
      el.classList.remove('stagger-item');
      el.style.removeProperty('--stagger-idx');
      el.style.removeProperty('--stagger-step');
      el.style.removeProperty('--stagger-delay');
    }
  };
}

/**
 * Плавное «съезжание» элементов списка при вставке нового элемента.
 * Использует пружинное смещение вместо резкого скачка.
 */
export function animateListInsert(
  container: HTMLElement,
  newElement: HTMLElement,
  siblingSelector = '.habit-card'
): void {
  const siblings = Array.from(
    container.querySelectorAll<HTMLElement>(siblingSelector)
  ).filter((el) => el !== newElement);

  if (lifecycle.prefersReducedMotion()) return;

  const finalTransforms = siblings.map((el) => el.style.transform);

  newElement.style.opacity = '0';
  newElement.style.transform = 'translateY(-8px) scale(0.96)';

  requestAnimationFrame(() => {
    newElement.style.transition = 'opacity 0.3s var(--ease-out-soft), transform 0.4s var(--spring)';
    newElement.style.opacity = '1';
    newElement.style.transform = '';

    siblings.forEach((el, i) => {
      const prev = finalTransforms[i] ?? '';
      if (prev) return;
      el.style.transition = 'transform 0.4s var(--spring)';
      el.style.transform = 'translateY(-6px)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transform = '';
        });
      });
    });
  });
}
