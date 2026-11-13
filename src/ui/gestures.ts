export class SwipeManager {
  private startX = 0;
  private currentCard: HTMLElement | null = null;

  constructor(private container: HTMLElement) {
    this.container.addEventListener('pointerdown', this.onDown.bind(this));
    this.container.addEventListener('pointermove', this.onMove.bind(this));
    this.container.addEventListener('pointerup', this.onUp.bind(this));
  }

  private onDown(e: PointerEvent) {
    const card = (e.target as HTMLElement).closest('.habit-card') as HTMLElement;
    if (!card) return;
    this.currentCard = card;
    this.startX = e.clientX;
    card.style.transition = 'none';
  }

  private onMove(e: PointerEvent) {
    if (!this.currentCard) return;
    const delta = e.clientX - this.startX;
    this.currentCard.style.transform = `translateX(${delta}px)`;
  }

  private onUp(e: PointerEvent) {
    if (!this.currentCard) return;
    const delta = e.clientX - this.startX;
    
    if (Math.abs(delta) > 100) {
      // Свайп засчитан
      this.currentCard.style.transform = delta > 0 ? 'translateX(100%)' : 'translateX(-100%)';
      setTimeout(() => this.currentCard?.remove(), 200);
    } else {
      // Возврат
      this.currentCard.style.transition = 'transform 0.3s var(--spring)';
      this.currentCard.style.transform = 'translateX(0)';
    }
    this.currentCard = null;
  }
}
