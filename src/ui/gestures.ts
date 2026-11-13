export type SwipeDirection = 'left' | 'right-short' | 'right-long';

export class SwipeManager {
  private startX = 0;
  private startY = 0;
  private currentCard: HTMLElement | null = null;
  private isSwiping = false;

  constructor(
    private container: HTMLElement,
    private onSwipe: (habitId: string, direction: SwipeDirection) => void
  ) {
    this.container.addEventListener('pointerdown', this.onDown);
    this.container.addEventListener('pointermove', this.onMove);
    this.container.addEventListener('pointerup', this.onUp);
    this.container.addEventListener('pointercancel', this.onCancel);
  }

  private onDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a')) return;

    const card = target.closest('.habit-card') as HTMLElement | null;
    if (!card) return;

    this.currentCard = card;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.isSwiping = false;
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.currentCard) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    if (!this.isSwiping) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        this.isSwiping = true;
        this.currentCard.style.transition = 'none';
      } else if (Math.abs(dy) > 12) {
        this.currentCard = null;
        return;
      } else {
        return;
      }
    }

    const clamped = Math.max(-140, Math.min(180, dx));
    this.currentCard.style.transform = `translateX(${clamped}px)`;
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.currentCard) return;
    const card = this.currentCard;
    const dx = e.clientX - this.startX;
    const habitId = card.dataset.habitId;

    card.style.transition = 'transform 0.25s var(--spring)';
    card.style.transform = 'translateX(0)';
    this.currentCard = null;

    if (!this.isSwiping || !habitId) return;
    this.isSwiping = false;

    if (dx > 130) {
      this.onSwipe(habitId, 'right-long');
    } else if (dx > 65) {
      this.onSwipe(habitId, 'right-short');
    } else if (dx < -75) {
      this.onSwipe(habitId, 'left');
    }
  };

  private onCancel = (): void => {
    if (this.currentCard) {
      this.currentCard.style.transition = 'transform 0.25s var(--spring)';
      this.currentCard.style.transform = 'translateX(0)';
    }
    this.currentCard = null;
    this.isSwiping = false;
  };
}
