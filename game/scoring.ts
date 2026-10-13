import type { Outcome } from '@/types/game';

export interface ScoreInput {
  alive: boolean;
  scienceDelivered: number;
  scienceTarget: number;
  budget: number;
  budgetLeft: number;
  difficultyMultiplier: number;
  safeModeTurns: number;
  damagedComponents: number;
}

export interface ScoreResult {
  outcome: Outcome;
  stars: 0 | 1 | 2 | 3;
  score: number;
}

export function calculateScore(input: ScoreInput): ScoreResult {
  const science = Math.round(input.scienceDelivered * 10) / 10;
  const outcome: Outcome =
    input.alive && science >= input.scienceTarget ? 'success' : science > 0 ? 'partial' : 'failure';

  const budgetShare = input.budget > 0 ? Math.max(0, input.budgetLeft) / input.budget : 0;
  const raw =
    science * (1 + budgetShare * 0.5) * input.difficultyMultiplier -
    5 * input.safeModeTurns -
    10 * input.damagedComponents;
  const score = Math.max(0, Math.round(raw));

  const stars: 0 | 1 | 2 | 3 =
    outcome === 'failure' ? 0 : outcome === 'partial' ? 1 : budgetShare >= 0.2 ? 3 : 2;

  return { outcome, stars, score };
}
