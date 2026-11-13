import type { AppEventMap } from './types';

export type EventHandler<Payload> = (payload: Payload) => void;

export interface SubscribeOptions {
  readonly signal?: AbortSignal;
  readonly once?: boolean;
}

export class TypedEventBus<Events extends object = AppEventMap> {
  private readonly channels = new Map<keyof Events, Set<EventHandler<never>>>();

  on<K extends keyof Events>(
    event: K,
    handler: EventHandler<Events[K]>,
    options?: SubscribeOptions
  ): () => void {
    if (options?.signal?.aborted) {
      return () => undefined;
    }

    let wrapped: EventHandler<Events[K]> = handler;
    if (options?.once) {
      wrapped = (payload: Events[K]) => {
        unsubscribe();
        handler(payload);
      };
    }

    let set = this.channels.get(event);
    if (!set) {
      set = new Set();
      this.channels.set(event, set);
    }
    set.add(wrapped as EventHandler<never>);

    const unsubscribe = (): void => {
      this.channels.get(event)?.delete(wrapped as EventHandler<never>);
    };

    if (options?.signal) {
      options.signal.addEventListener('abort', unsubscribe, { once: true });
    }

    return unsubscribe;
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const listeners = this.channels.get(event);
    if (!listeners || listeners.size === 0) return;

    for (const fn of Array.from(listeners)) {
      try {
        (fn as EventHandler<Events[K]>)(payload);
      } catch {
        // Ошибка одного подписчика не должна ронять остальных слушателей
      }
    }
  }

  clearAll(): void {
    this.channels.clear();
  }
}

export const eventBus = new TypedEventBus<AppEventMap>();
