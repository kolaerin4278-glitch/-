import { SPHERES, type Sphere } from '../constants';
import type { Habit } from './types';

/**
 * Анализ сложности цепочек Habit Stack (план 04, п. 0398, 0380).
 *
 * Цепочка считается перегруженной, если в ней слишком много звеньев
 * или суммарная энергетическая стоимость превышает порог.
 */

/** Максимально разумная длина цепочки. */
export const MAX_STACK_LENGTH = 4;

/** Порог суммарной энергетической стоимости цепочки. */
export const MAX_STACK_ENERGY = 8;

export interface StackAnalysis {
  /** Привычки цепочки в порядке выполнения. */
  readonly chain: readonly Habit[];
  /** Длина цепочки. */
  readonly length: number;
  /** Суммарная энергетическая стоимость. */
  readonly totalEnergy: number;
  /** Уровень сложности. */
  readonly level: 'easy' | 'medium' | 'hard';
  /** Предупреждение для пользователя, если цепочка перегружена. */
  readonly warning: string | null;
}

/**
 * Строит цепочку привычек по связям `stackAfterId`,
 * начиная с привычки `habitId`.
 */
export function buildStackChain(habitId: string, all: readonly Habit[]): Habit[] {
  const byId = new Map(all.map((h) => [h.id, h]));
  const chain: Habit[] = [];

  let current = byId.get(habitId);
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.stackAfterId ? byId.get(current.stackAfterId) : undefined;
  }

  return chain;
}

/**
 * Анализирует сложность цепочки, начинающейся с указанной привычки.
 */
export function analyzeStack(habitId: string, all: readonly Habit[]): StackAnalysis {
  const chain = buildStackChain(habitId, all);
  const totalEnergy = chain.reduce((sum, h) => sum + (h.energyCost ?? 2), 0);

  let level: StackAnalysis['level'] = 'easy';
  let warning: string | null = null;

  if (chain.length > MAX_STACK_LENGTH) {
    level = 'hard';
    warning = `Цепочка из ${chain.length} звеньев слишком длинная — выполните её по частям`;
  } else if (totalEnergy > MAX_STACK_ENERGY) {
    level = 'hard';
    warning = `Суммарная энергозатратность ${totalEnergy}⚡ выше нормы — упростите цепочку`;
  } else if (chain.length >= 3 || totalEnergy >= 6) {
    level = 'medium';
    warning = `Цепочка требует ${totalEnergy}⚡ — начните с самого простого звена`;
  }

  return { chain, length: chain.length, totalEnergy, level, warning };
}

/**
 * Проверяет, не создаст ли новая связь перегруженную цепочку.
 * Используется в конструкторе привычки.
 */
export function validateStackLink(
  stackAfterId: string,
  all: readonly Habit[]
): { ok: boolean; message: string | null } {
  const chain = buildStackChain(stackAfterId, all);
  const totalEnergy = chain.reduce((sum, h) => sum + (h.energyCost ?? 2), 0);

  if (chain.length + 1 > MAX_STACK_LENGTH) {
    return {
      ok: false,
      message: `Цепочка станет из ${chain.length + 1} звеньев — это слишком много`
    };
  }

  if (totalEnergy + 2 > MAX_STACK_ENERGY) {
    return {
      ok: false,
      message: `Суммарная энергозатратность цепочки превысит ${MAX_STACK_ENERGY}⚡`
    };
  }

  return { ok: true, message: null };
}

/**
 * Форматирует цепочку в читаемый вид: «Чашка воды → Разминка → Чтение».
 */
export function formatStackChain(chain: readonly Habit[]): string {
  return chain.map((h) => h.title).join(' → ');
}

/**
 * Группирует привычки по сферам для карты профиля.
 */
export function groupBySphere(habits: readonly Habit[]): Map<Sphere, Habit[]> {
  const map = new Map<Sphere, Habit[]>();
  for (const h of habits) {
    const list = map.get(h.sphere) ?? [];
    list.push(h);
    map.set(h.sphere, list);
  }
  // Гарантируем наличие всех сфер, даже пустых
  for (const s of Object.values(SPHERES)) {
    if (!map.has(s)) map.set(s, []);
  }
  return map;
}
