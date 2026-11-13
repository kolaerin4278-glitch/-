interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

export class LifecycleManager {
  private controller = new AbortController();
  private flushCallbacks = new Set<() => void>();
  private resumeCallbacks = new Set<() => void>();
  private bound = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  bind(): void {
    if (this.bound || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.bound = true;

    const signal = this.controller.signal;

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') {
          this.runFlush();
        } else if (document.visibilityState === 'visible') {
          this.runResume();
        }
      },
      { signal }
    );

    window.addEventListener('pagehide', () => this.runFlush(), { signal });
    window.addEventListener('beforeunload', () => this.runFlush(), { signal });
    document.addEventListener('freeze', () => this.runFlush(), { signal });
    window.addEventListener('pageshow', () => this.runResume(), { signal });
  }

  onFlush(cb: () => void): () => void {
    this.flushCallbacks.add(cb);
    return () => this.flushCallbacks.delete(cb);
  }

  onResume(cb: () => void): () => void {
    this.resumeCallbacks.add(cb);
    return () => this.resumeCallbacks.delete(cb);
  }

  isSaveDataEnabled(): boolean {
    if (typeof navigator === 'undefined') return false;
    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    return Boolean(conn?.saveData || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g');
  }

  prefersReducedMotion(overrideSetting = false): boolean {
    if (overrideSetting) return true;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private runFlush(): void {
    for (const cb of this.flushCallbacks) {
      try {
        cb();
      } catch {
        // ignore flush failure
      }
    }
  }

  private runResume(): void {
    for (const cb of this.resumeCallbacks) {
      try {
        cb();
      } catch {
        // ignore resume failure
      }
    }
  }

  dispose(): void {
    this.controller.abort();
    this.controller = new AbortController();
    this.bound = false;
  }
}

export const lifecycle = new LifecycleManager();
