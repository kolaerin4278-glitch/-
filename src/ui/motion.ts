import { lifecycle } from '../core/lifecycle';
import { createSpring, type SpringOptions } from '../animations/spring';

/**
 * Обратно совместимый слой над общей реализацией пружинной физики
 * (`src/animations/spring.ts`). Единственный источник правды по пружинам —
 * модуль `animations/spring`; здесь сохранён прежний публичный API.
 */

export interface SpringConfig {
  readonly stiffness?: number;
  readonly damping?: number;
  readonly mass?: number;
  readonly precision?: number;
}

/**
 * Запускает пружинную анимацию. Возвращает функцию отмены.
 */
export function animateSpring(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
  config: SpringConfig = {}
): () => void {
  const handle = createSpring(from, to, onUpdate, onComplete, config as SpringOptions);
  return () => handle.stop();
}

/**
 * Обёртка над View Transitions API с учётом prefers-reduced-motion
 */
export function runViewTransition(mutateDom: () => void, reduceMotionOverride = false): void {
  if (
    lifecycle.prefersReducedMotion(reduceMotionOverride) ||
    typeof document === 'undefined' ||
    !('startViewTransition' in document)
  ) {
    mutateDom();
    return;
  }

  try {
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
      mutateDom();
    });
  } catch {
    mutateDom();
  }
}

/**
 * Устанавливает will-change только на время анимации, затем очищает (План 02 пп. 009–010)
 */
export function withTemporaryWillChange(el: HTMLElement | null, prop = 'transform', durationMs = 360): void {
  if (!el) return;
  el.style.willChange = prop;
  setTimeout(() => {
    el.style.willChange = 'auto';
  }, durationMs);
}
