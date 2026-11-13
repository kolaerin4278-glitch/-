import { SWIPE_THRESHOLDS } from '../constants';
import { telegram } from '../telegram';
import { withTemporaryWillChange } from './motion';

export type SwipeDirection = 'left' | 'right-short' | 'right-long';

export interface SwipeCallbacks {
  onSwipe: (habitId: string, direction: SwipeDirection) => void;
  onContextMenu?: (habitId: string, clientX: number, clientY: number) => void;
}

export class SwipeManager {
  private startX = 0;
  private startY = 0;
  private currentCard: HTMLElement | null = null;
  private currentBackdrop: HTMLElement | null = null;
  private isSwiping = false;
  private lastThresholdStage: 'none' | 'planb' | 'full' | 'skip' = 'none';
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly abortController = new AbortController();

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: SwipeCallbacks | ((habitId: string, direction: SwipeDirection) => void)
  ) {
    const signal = this.abortController.signal;
    this.container.addEventListener('pointerdown', this.onDown, { signal });
    this.container.addEventListener('pointermove', this.onMove, { signal });
    this.container.addEventListener('pointerup', this.onUp, { signal });
    this.container.addEventListener('pointercancel', this.onCancel, { signal });
    this.container.addEventListener('contextmenu', this.onContextMenuEvent, { signal });
  }

  private emitSwipe(habitId: string, dir: SwipeDirection): void {
    if (typeof this.callbacks === 'function') {
      this.callbacks(habitId, dir);
    } else {
      this.callbacks.onSwipe(habitId, dir);
    }
  }

  private emitContext(habitId: string, x: number, y: number): void {
    if (typeof this.callbacks !== 'function' && this.callbacks.onContextMenu) {
      this.callbacks.onContextMenu(habitId, x, y);
    }
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private onContextMenuEvent = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    const card = target?.closest('.habit-card') as HTMLElement | null;
    const habitId = card?.dataset['habitId'];
    if (!card || !habitId) return;
    if (typeof this.callbacks !== 'function' && this.callbacks.onContextMenu) {
      e.preventDefault();
      this.emitContext(habitId, e.clientX, e.clientY);
    }
  };

  private onDown = (e: PointerEvent): void => {
    // Защита краевых 24px экрана от конфликта с системным жестом «Назад» в iOS Safari WebView
    if (
      typeof window !== 'undefined' &&
      (e.clientX < SWIPE_THRESHOLDS.EDGE_GUARD_PX ||
        e.clientX > window.innerWidth - SWIPE_THRESHOLDS.EDGE_GUARD_PX)
    ) {
      return;
    }

    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a')) return;

    const card = target.closest('.habit-card') as HTMLElement | null;
    if (!card) return;

    this.currentCard = card;
    this.currentBackdrop = card.parentElement?.querySelector('.swipe-backdrop') as HTMLElement | null;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.isSwiping = false;
    this.lastThresholdStage = 'none';

    const habitId = card.dataset['habitId'];
    this.clearLongPress();
    if (habitId && typeof this.callbacks !== 'function' && this.callbacks.onContextMenu) {
      const x = e.clientX;
      const y = e.clientY;
      this.longPressTimer = setTimeout(() => {
        if (!this.isSwiping && this.currentCard) {
          telegram.haptic('medium');
          this.emitContext(habitId, x, y);
          this.resetCardVisual();
        }
      }, 520);
    }
  };

  private applyRubberBand(dx: number): number {
    if (dx > 135) {
      return 135 + Math.pow(dx - 135, 0.7);
    }
    if (dx < -95) {
      return -95 - Math.pow(Math.abs(dx + 95), 0.7);
    }
    return dx;
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.currentCard) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      this.clearLongPress();
    }

    if (!this.isSwiping) {
      if (Math.abs(dx) > SWIPE_THRESHOLDS.DIRECTION_LOCK_PX && Math.abs(dx) > Math.abs(dy) * 1.25) {
        this.isSwiping = true;
        this.currentCard.style.transition = 'none';
        withTemporaryWillChange(this.currentCard, 'transform', 600);
      } else if (Math.abs(dy) > SWIPE_THRESHOLDS.DIRECTION_LOCK_PX) {
        this.currentCard = null;
        this.currentBackdrop = null;
        return;
      } else {
        return;
      }
    }

    const damped = Math.max(
      SWIPE_THRESHOLDS.MAX_DRAG_LEFT_PX,
      Math.min(SWIPE_THRESHOLDS.MAX_DRAG_RIGHT_PX, this.applyRubberBand(dx))
    );
    this.currentCard.style.transform = `translate3d(${damped.toFixed(1)}px, 0, 0)`;

    let nextStage: 'none' | 'planb' | 'full' | 'skip' = 'none';
    if (dx >= SWIPE_THRESHOLDS.FULL_RIGHT_PX) {
      nextStage = 'full';
    } else if (dx >= SWIPE_THRESHOLDS.PLAN_B_RIGHT_PX) {
      nextStage = 'planb';
    } else if (dx <= SWIPE_THRESHOLDS.SKIP_LEFT_PX) {
      nextStage = 'skip';
    }

    if (nextStage !== this.lastThresholdStage) {
      this.lastThresholdStage = nextStage;
      if (nextStage !== 'none') {
        telegram.hapticSelection();
      }
      this.updateBackdropVisual(nextStage);
    }
  };

  private updateBackdropVisual(stage: 'none' | 'planb' | 'full' | 'skip'): void {
    const bd = this.currentBackdrop;
    if (!bd) return;
    bd.classList.remove('mode-planb', 'mode-full', 'mode-skip');
    if (stage === 'planb') {
      bd.classList.add('mode-planb');
      bd.textContent = '→ План Б (минимум)';
    } else if (stage === 'full') {
      bd.classList.add('mode-full');
      bd.textContent = '→→ Полная норма ✓';
    } else if (stage === 'skip') {
      bd.classList.add('mode-skip');
      bd.textContent = 'Пропуск ←';
    } else {
      bd.textContent = '';
    }
  }

  private resetCardVisual(): void {
    if (this.currentCard) {
      this.currentCard.style.transition = 'transform 0.28s var(--spring)';
      this.currentCard.style.transform = 'translate3d(0, 0, 0)';
    }
    this.updateBackdropVisual('none');
    this.currentCard = null;
    this.currentBackdrop = null;
    this.isSwiping = false;
    this.lastThresholdStage = 'none';
  }

  private onUp = (e: PointerEvent): void => {
    this.clearLongPress();
    if (!this.currentCard) return;
    const dx = e.clientX - this.startX;
    const habitId = this.currentCard.dataset['habitId'];
    const wasSwiping = this.isSwiping;

    this.resetCardVisual();

    if (!wasSwiping || !habitId) return;

    if (dx >= SWIPE_THRESHOLDS.FULL_RIGHT_PX) {
      this.emitSwipe(habitId, 'right-long');
    } else if (dx >= SWIPE_THRESHOLDS.PLAN_B_RIGHT_PX) {
      this.emitSwipe(habitId, 'right-short');
    } else if (dx <= SWIPE_THRESHOLDS.SKIP_LEFT_PX) {
      this.emitSwipe(habitId, 'left');
    }
  };

  private onCancel = (): void => {
    this.clearLongPress();
    this.resetCardVisual();
  };

  destroy(): void {
    this.clearLongPress();
    this.abortController.abort();
  }
}
