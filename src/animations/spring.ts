import { lifecycle } from '../core/lifecycle';

/**
 * Пружинная физика — единственная реализация пружинного интегратора в проекте.
 * `ui/motion.ts` переиспользует этот модуль как обратно совместимую обёртку.
 *
 * Модель: сила пружины + демпфирование, интегрирование полушаговым методом Эйлера.
 * dt ограничивается, чтобы после возврата на вкладку анимация не «телепортировалась».
 */

export interface SpringPreset {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

export const SPRING_PRESETS = Object.freeze({
  /** Мгновенный, но мягкий отклик — нажатия кнопок */
  snappy: { stiffness: 420, damping: 32, mass: 1 },
  /** Стандартный интерфейсный переход — появление карточек */
  smooth: { stiffness: 260, damping: 24, mass: 1 },
  /** Выраженное пружинистое движение — чеки, иконки */
  bouncy: { stiffness: 340, damping: 18, mass: 1 },
  /** Мягкое затухание — прокрутка, плавные перемещения */
  gentle: { stiffness: 180, damping: 22, mass: 1 },
  /** Тяжёлое инерционное движение — шторки, крупные элементы */
  heavy: { stiffness: 140, damping: 20, mass: 1.2 }
} as const satisfies Record<string, SpringPreset>);

export type SpringPresetName = keyof typeof SPRING_PRESETS;

export interface SpringOptions {
  readonly stiffness?: number;
  readonly damping?: number;
  readonly mass?: number;
  /** Порог покоя: ниже — анимация считается завершённой */
  readonly precision?: number;
}

export interface SpringAnimationHandle {
  /** Остановить анимацию, оставив текущее значение */
  stop(): void;
  /** Перевести анимацию к новой цели на лету */
  retarget(to: number): void;
  /** Промис, резолвящийся по завершении или остановке */
  finished: Promise<void>;
}

const DEFAULT_PRECISION = 0.01;
const MAX_DT = 0.032;
const MIN_DT = 0.001;

/**
 * Создаёт непрерывную пружинную анимацию с возможностью смены цели на лету.
 */
export function createSpring(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
  options: SpringOptions | SpringPresetName = 'smooth'
): SpringAnimationHandle {
  const cfg: SpringOptions =
    typeof options === 'string' ? SPRING_PRESETS[options] : options;

  const stiffness = cfg.stiffness ?? 260;
  const damping = cfg.damping ?? 24;
  const mass = cfg.mass ?? 1;
  const precision = cfg.precision ?? DEFAULT_PRECISION;

  let position = from;
  let velocity = 0;
  let target = to;
  let lastTime = performance.now();
  let rafId: number | null = null;
  let stopped = false;

  let resolveFinished: () => void = () => undefined;

  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  if (lifecycle.prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
    onUpdate(to);
    onComplete?.();
    resolveFinished();
    return {
      stop: () => undefined,
      retarget: () => undefined,
      finished
    };
  }

  const step = (now: number): void => {
    if (stopped) return;

    const dt = Math.min(MAX_DT, Math.max(MIN_DT, (now - lastTime) / 1000));
    lastTime = now;

    const force = -stiffness * (position - target);
    const dampForce = -damping * velocity;
    const accel = (force + dampForce) / mass;

    velocity += accel * dt;
    position += velocity * dt;

    if (Math.abs(velocity) < precision && Math.abs(position - target) < precision) {
      position = target;
      velocity = 0;
      onUpdate(target);
      rafId = null;
      onComplete?.();
      resolveFinished();
      return;
    }

    onUpdate(position);
    rafId = requestAnimationFrame(step);
  };

  rafId = requestAnimationFrame(step);

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      resolveFinished();
    },
    retarget(nextTo: number): void {
      if (stopped) return;
      target = nextTo;
      if (rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(step);
      }
    },
    finished
  };
}

/**
 * Пружинная анимация CSS-переменной — удобный слой для прогресс-баров и счётчиков.
 */
export function animateCssVar(
  el: HTMLElement,
  varName: string,
  from: number,
  to: number,
  unit = '',
  preset: SpringPresetName = 'smooth'
): SpringAnimationHandle {
  return createSpring(
    from,
    to,
    (value) => {
      el.style.setProperty(varName, `${value.toFixed(2)}${unit}`);
    },
    undefined,
    preset
  );
}
