import { UNDO_HISTORY_LIMIT } from '../constants';
import { eventBus } from '../core/event-bus';
import { createDefaultAppState } from '../core/factory';
import type { AppState } from '../core/types';

export interface StoreCommand<TResult = void> {
  readonly type: string;
  readonly undoable?: boolean;
  readonly label?: string;
  execute(state: AppState): { nextState: AppState; result: TResult; inverse?: (s: AppState) => AppState };
}

interface UndoEntry {
  readonly type: string;
  readonly label: string;
  readonly undo: (s: AppState) => AppState;
  readonly redo: (s: AppState) => AppState;
}

export interface CommandMetrics {
  readonly totalDispatched: number;
  readonly lastCommandType: string;
  readonly lastDurationMs: number;
}

export function createMemoSelector<TSlice, TResult>(
  sliceFn: (state: AppState) => TSlice,
  computeFn: (slice: TSlice) => TResult,
  isEqual: (a: TSlice, b: TSlice) => boolean = Object.is
): (state: AppState) => TResult {
  let hasPrev = false;
  let prevSlice!: TSlice;
  let prevResult!: TResult;

  return (state: AppState): TResult => {
    const nextSlice = sliceFn(state);
    if (hasPrev && isEqual(prevSlice, nextSlice)) {
      return prevResult;
    }
    prevSlice = nextSlice;
    prevResult = computeFn(nextSlice);
    hasPrev = true;
    return prevResult;
  };
}

export class CommandStore {
  private state: AppState = createDefaultAppState();
  private readonly subscribers = new Set<(state: AppState) => void>();
  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];
  private rafScheduled = false;
  private lastSourceCommand = 'init';
  private metrics: CommandMetrics = {
    totalDispatched: 0,
    lastCommandType: 'init',
    lastDurationMs: 0
  };

  getState(): AppState {
    return this.state;
  }

  replaceState(nextState: AppState, source = 'hydrate', notifyImmediate = true): void {
    this.state = nextState;
    this.lastSourceCommand = source;
    if (notifyImmediate) {
      this.flushSubscribers();
    } else {
      this.scheduleNotify();
    }
  }

  dispatch<TResult>(command: StoreCommand<TResult>): TResult {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prevState = this.state;
    const { nextState, result, inverse } = command.execute(prevState);

    this.state = {
      ...nextState,
      lastSavedAt: Date.now()
    };

    if (command.undoable && inverse) {
      this.undoStack.push({
        type: command.type,
        label: command.label ?? command.type,
        undo: inverse,
        redo: (s) => command.execute(s).nextState
      });
      if (this.undoStack.length > UNDO_HISTORY_LIMIT) {
        this.undoStack.shift();
      }
      this.redoStack.length = 0;
    }

    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.metrics = {
      totalDispatched: this.metrics.totalDispatched + 1,
      lastCommandType: command.type,
      lastDurationMs: Math.round((end - start) * 100) / 100
    };

    this.lastSourceCommand = command.type;
    this.scheduleNotify();
    return result;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): string | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.state = {
      ...entry.undo(this.state),
      lastSavedAt: Date.now()
    };
    this.redoStack.push(entry);
    this.lastSourceCommand = `undo:${entry.type}`;
    this.flushSubscribers();
    return entry.label;
  }

  redo(): string | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.state = {
      ...entry.redo(this.state),
      lastSavedAt: Date.now()
    };
    this.undoStack.push(entry);
    this.lastSourceCommand = `redo:${entry.type}`;
    this.flushSubscribers();
    return entry.label;
  }

  clearHistory(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  getMetrics(): CommandMetrics {
    return this.metrics;
  }

  subscribe(listener: (state: AppState) => void, signal?: AbortSignal): () => void {
    if (signal?.aborted) return () => undefined;
    this.subscribers.add(listener);
    const unsub = () => {
      this.subscribers.delete(listener);
    };
    if (signal) {
      signal.addEventListener('abort', unsub, { once: true });
    }
    return unsub;
  }

  flushSubscribers(): void {
    this.rafScheduled = false;
    for (const listener of Array.from(this.subscribers)) {
      try {
        listener(this.state);
      } catch {
        // Ошибка рендера одного компонента не прерывает остальных
      }
    }
    eventBus.emit('state:changed', {
      state: this.state,
      sourceCommand: this.lastSourceCommand
    });
  }

  private scheduleNotify(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      this.flushSubscribers();
      return;
    }
    if (this.rafScheduled) return;
    this.rafScheduled = true;
    requestAnimationFrame(() => {
      this.flushSubscribers();
    });
  }
}

export const appStore = new CommandStore();
