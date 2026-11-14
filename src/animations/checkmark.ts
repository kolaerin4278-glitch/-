import { lifecycle } from '../core/lifecycle';

/**
 * Анимирует SVG-галочку при выполнении привычки —
 * путь «рисуется» по контуру, создавая эффект ручного чек-бокса.
 */
export function animateCheckmark(svgPath: SVGPathElement): Promise<void> {
  if (lifecycle.prefersReducedMotion() || !svgPath) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const length = svgPath.getTotalLength();
    svgPath.style.strokeDasharray = String(length);
    svgPath.style.strokeDashoffset = String(length);
    svgPath.style.transition = 'stroke-dashoffset 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        svgPath.style.strokeDashoffset = '0';
        setTimeout(() => {
          svgPath.style.strokeDasharray = '';
          svgPath.style.strokeDashoffset = '';
          svgPath.style.transition = '';
          resolve();
        }, 450);
      });
    });
  });
}

/**
 * Анимация «тряски» карточки при потере серии (streak loss).
 * Используется keyframes через временный класс.
 */
export function animateStreakLoss(card: HTMLElement): void {
  if (lifecycle.prefersReducedMotion() || !card) return;

  const keyframes = [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-6px)' },
    { transform: 'translateX(5px)' },
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(3px)' },
    { transform: 'translateX(0)' }
  ];

  const timing: KeyframeAnimationOptions = {
    duration: 380,
    easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)'
  };

  card.animate(keyframes, timing);
}

/**
 * Анимация пульсации иконки при достижении милстоуна серии.
 */
export function animateMilestonePulse(iconEl: HTMLElement): void {
  if (lifecycle.prefersReducedMotion() || !iconEl) return;

  const keyframes = [
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.2)', filter: 'brightness(1.35)' },
    { transform: 'scale(1.05)', filter: 'brightness(1.15)' },
    { transform: 'scale(1)', filter: 'brightness(1)' }
  ];

  const timing: KeyframeAnimationOptions = {
    duration: 520,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
  };

  iconEl.animate(keyframes, timing);
}

/**
 * Эффект «эвапорации» щита — плавное исчезновение с расширением.
 */
export function animateShieldEvaporate(shieldEl: HTMLElement): Promise<void> {
  if (lifecycle.prefersReducedMotion() || !shieldEl) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const keyframes = [
      { transform: 'scale(1)', opacity: '1' },
      { transform: 'scale(1.25)', opacity: '0.7' },
      { transform: 'scale(1.5)', opacity: '0' }
    ];

    const timing: KeyframeAnimationOptions = {
      duration: 650,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards'
    };

    const anim = shieldEl.animate(keyframes, timing);
    anim.onfinish = () => resolve();
  });
}
