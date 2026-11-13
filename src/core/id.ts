import { DEVICE_ID_KEY } from '../constants';

let monotonicSeq = 0;

export function createEntityId(prefix = 'hd'): string {
  monotonicSeq = (monotonicSeq + 1) % 1_000_000;
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
  return `${prefix}_${Date.now().toString(36)}_${monotonicSeq.toString(36)}_${uuid.slice(0, 8)}`;
}

export function createOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  monotonicSeq = (monotonicSeq + 1) % 1_000_000;
  return `op-${Date.now()}-${monotonicSeq}`;
}

export function getOrCreateDeviceId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(DEVICE_ID_KEY);
      if (existing && existing.length >= 8) {
        return existing;
      }
      const generated = createEntityId('dev');
      localStorage.setItem(DEVICE_ID_KEY, generated);
      return generated;
    }
  } catch {
    // Приватный режим Safari или тестовая среда без localStorage
  }
  return 'dev_ephemeral_session';
}
