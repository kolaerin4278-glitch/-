import { lifecycle } from '../core/lifecycle';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  alpha: number;
}

const MILESTONE_PALETTES: Record<number, readonly string[]> = {
  7: ['#34D399', '#6EE7B7', '#38BDF8'],
  14: ['#38BDF8', '#818CF8', '#34D399'],
  30: ['#FBBF24', '#F59E0B', '#34D399', '#A855F7'],
  60: ['#C084FC', '#F472B6', '#FBBF24', '#34D399'],
  100: ['#FDE047', '#F59E0B', '#34D399', '#38BDF8', '#EC4899']
};

class ConfettiEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private rafId: number | null = null;
  private lastTriggeredAt = 0;

  private ensureInitialized(): boolean {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    if (!this.canvas) {
      this.canvas = document.getElementById('confettiCanvas') as HTMLCanvasElement | null;
      if (!this.canvas) return false;
      this.canvas.setAttribute('aria-hidden', 'true');
      this.ctx = this.canvas.getContext('2d');
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stop();
      });
    }
    if (!this.canvas || !this.ctx) return false;

    // Ограничение DPR <= 2 для экономии GPU (План 06 п. 021)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
  }

  trigger(milestone = 7, confettiEnabled = true, reduceMotionOverride = false): void {
    if (!confettiEnabled || lifecycle.prefersReducedMotion(reduceMotionOverride)) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const now = Date.now();
    // Не чаще 1 раза в 3 секунды (План 06 п. 716)
    if (now - this.lastTriggeredAt < 3000) return;
    this.lastTriggeredAt = now;

    if (!this.ensureInitialized() || !this.ctx) return;

    const palette = MILESTONE_PALETTES[milestone] ?? MILESTONE_PALETTES[7]!;
    const lowEnd =
      lifecycle.isSaveDataEnabled() ||
      (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 4) <= 4);
    const count = lowEnd ? 28 : 64;

    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * 0.28;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6.5;
      this.particles.push({
        x: originX + (Math.random() - 0.5) * 60,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size: 5 + Math.random() * 5,
        color: palette[i % palette.length] ?? '#34D399',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.2,
        alpha: 1
      });
    }

    if (this.rafId === null) {
      this.loop();
    }
  }

  private loop = (): void => {
    if (!this.ctx || !this.canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.clearRect(0, 0, w, h);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.99;
      p.rotation += p.vRot;
      p.alpha -= 0.012;

      if (p.alpha <= 0 || p.y > h + 20) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.rafId = requestAnimationFrame(this.loop);
    } else {
      this.stop();
    }
  };

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.particles = [];
    if (this.ctx) {
      this.ctx.clearRect(0, 0, window.innerWidth || 1000, window.innerHeight || 1000);
    }
  }
}

export const confetti = new ConfettiEngine();
