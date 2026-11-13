import { lifecycle } from '../core/lifecycle';

export interface SpringConfig {
  readonly stiffness?: number;
  readonly damping?: number;
  readonly mass?: number;
  readonly precision?: number;
}

/**
 * Пружинный интегратор (Spring Physics) для плавных естественных переходов
 */
export function animateSpring(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
  config: SpringConfig = {}
): () => void {
  if (lifecycle.prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
    onUpdate(to);
    onComplete?.();
    return () => undefined;
  }

  const stiffness = config.stiffness ?? 260;
  const damping = config.damping ?? 24;
  const mass = config.mass ?? 1;
  const precision = config.precision ?? 0.01;

  let position = from;
  let velocity = 0;
  let lastTime = performance.now();
  let rafId: number | null = null;
  let cancelled = false;

  const step = (now: number): void => {
    if (cancelled) return;
    const dt = Math.min(0.032, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    const force = -stiffness * (position - to);
    const dampForce = -damping * velocity;
    const accel = (force + dampForce) / mass;

    velocity += accel * dt;
    position += velocity * dt;

    if (Math.abs(velocity) < precision && Math.abs(position - to) < precision) {
      onUpdate(to);
      onComplete?.();
      return;
    }

    onUpdate(position);
    rafId = requestAnimationFrame(step);
  };

  rafId = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
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
