import { lifecycle } from '../core/lifecycle';

type AnimationTask = () => void;

/**
 * Централизованный менеджер анимаций:
 * - приостанавливает все активные задачи при уходе приложения в фон (document.hidden);
 * - приостанавливает тяжёлые эффекты при включённом Save-Data;
 * - предоставляет единую точку отмены через AbortSignal.
 */
class AnimationManager {
  private readonly tasks = new Set<AnimationTask>();
  private readonly abortController = new AbortController();
  private paused = false;
  private bound = false;
  private readonly pendingResumes = new Set<AnimationTask>();

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  bind(): void {
    if (this.bound || typeof document === 'undefined') return;
    this.bound = true;

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.pause();
        } else {
          this.resume();
        }
      },
      { signal: this.abortController.signal }
    );

    // Save-Data режим: тяжёлые эффекты отключаем заранее
    if (lifecycle.isSaveDataEnabled()) {
      this.paused = true;
    }
  }

  /** Регистрирует длительную задачу, которая будет остановлена при паузе */
  register(task: AnimationTask): () => void {
    this.tasks.add(task);
    return () => this.tasks.delete(task);
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const task of this.tasks) {
      this.pendingResumes.add(task);
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const task of this.pendingResumes) {
      try {
        task();
      } catch {
        // ignore
      }
    }
    this.pendingResumes.clear();
  }

  dispose(): void {
    this.abortController.abort();
    this.tasks.clear();
    this.pendingResumes.clear();
  }
}

export const animationManager = new AnimationManager();

/**
 * Запускает RAF-цикл, который автоматически останавливается при уходе в фон.
 * Возвращает функцию отмены.
 */
export function runAnimationLoop(step: (now: number) => void): () => void {
  if (typeof requestAnimationFrame === 'undefined') return () => undefined;

  let rafId: number | null = null;
  let cancelled = false;

  const tick = (now: number): void => {
    if (cancelled) return;
    step(now);
    rafId = requestAnimationFrame(tick);
  };

  const stopWhileHidden = (): void => {
    if (document.hidden) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else if (rafId === null && !cancelled) {
      rafId = requestAnimationFrame(tick);
    }
  };

  document.addEventListener('visibilitychange', stopWhileHidden);
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', stopWhileHidden);
  };
}
