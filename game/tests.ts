import type { Rng } from './rng';

export interface TestRoll {
  roll: number;
  bonus: number;
  total: number;
  difficulty: number;
  success: boolean;
}

/** d20 + bonus >= difficulty. A natural 1 always fails, a natural 20 always succeeds. */
export function rollTest(rng: Rng, bonus: number, difficulty: number): TestRoll {
  const roll = Math.floor(rng() * 20) + 1;
  const total = roll + bonus;
  const success = roll === 20 || (roll !== 1 && total >= difficulty);
  return { roll, bonus, total, difficulty, success };
}
