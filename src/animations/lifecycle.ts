import { lifecycle } from '../core/lifecycle';

/**
 * Анимации жизненного цикла привычки (план 04).
 *
 * — animateTrashIn: карточка «втягивается» в иконку корзины с эффектом сжатия (п. 0388)
 * — animateRestoreOut: карточка «вылетает» из корзины и появляется на месте (п. 0377)
 * — drawStackLine: SVG-линия связи между двумя карточками (п. 0352)
 */

/**
 * Карточка «втягивается» в иконку корзины: масштаб уменьшается,
 * элемент смещается к центру иконки корзины и растворяется.
 */
export function animateTrashIn(
  element: HTMLElement,
  trashTarget?: HTMLElement | null
): Promise<void> {
  if (!element || lifecycle.prefersReducedMotion()) {
    element?.remove();
    return Promise.resolve();
  }

  const rect = element.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  let scale = 0.2;

  if (trashTarget) {
    const target = trashTarget.getBoundingClientRect();
    dx = target.left + target.width / 2 - (rect.left + rect.width / 2);
    dy = target.top + target.height / 2 - (rect.top + rect.height / 2);
    scale = target.width / Math.max(rect.width, 1);
  }

  return new Promise((resolve) => {
    const anim = element.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${(1 + scale) / 2})`,
          opacity: 0.85,
          offset: 0.55
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 }
      ],
      {
        duration: 420,
        easing: 'cubic-bezier(0.5, 0, 0.75, 0)',
        fill: 'forwards'
      }
    );

    anim.onfinish = () => {
      element.remove();
      resolve();
    };
  });
}

/**
 * Карточка «вылетает» из корзины: появляется с увеличением и мягкой
 * пружинной посадкой на своё место в ленте.
 */
export function animateRestoreOut(element: HTMLElement): void {
  if (!element || lifecycle.prefersReducedMotion()) return;

  element.animate(
    [
      { transform: 'translateY(-16px) scale(0.92)', opacity: 0 },
      { transform: 'translateY(4px) scale(1.02)', opacity: 1, offset: 0.7 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ],
    {
      duration: 480,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    }
  );
}

/**
 * Плавная отрисовка линии связи между двумя карточками привычек (п. 0352).
 * Линия рисуется от нижнего центра первой карточки к верхнему центру второй.
 */
export function drawStackLine(
  container: HTMLElement,
  fromId: string,
  toId: string
): void {
  if (!container || lifecycle.prefersReducedMotion()) return;

  const from = container.querySelector<HTMLElement>(`[data-habit-id="${fromId}"]`);
  const to = container.querySelector<HTMLElement>(`[data-habit-id="${toId}"]`);
  if (!from || !to) return;

  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
  const y1 = fromRect.bottom - containerRect.top;
  const x2 = toRect.left + toRect.width / 2 - containerRect.left;
  const y2 = toRect.top - containerRect.top;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'stack-connector');
  svg.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);
  svg.setAttribute('width', String(containerRect.width));
  svg.setAttribute('height', String(containerRect.height));
  svg.style.pointerEvents = 'none';

  const path = document.createElementNS(NS, 'path');
  const midY = (y1 + y2) / 2;
  path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
  path.setAttribute('class', 'stack-connector-path');
  svg.appendChild(path);

  container.appendChild(svg);

  const length = path.getTotalLength?.() ?? 0;
  if (length > 0) {
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);
    path.animate(
      [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
      { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
  }
}

/**
 * Перетекание прогресс-бара связанной привычки (п. 0387).
 */
export function animateStackProgress(fromBar: HTMLElement, toBar: HTMLElement): void {
  if (!fromBar || !toBar || lifecycle.prefersReducedMotion()) return;

  const fromRect = fromBar.getBoundingClientRect();
  const toRect = toBar.getBoundingClientRect();
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;

  toBar.animate(
    [
      { transform: `translate(${-dx}px, ${-dy}px) scaleX(1)`, opacity: 0.9 },
      { transform: 'translate(0, 0) scaleX(1)', opacity: 1 }
    ],
    { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
}
