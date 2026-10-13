import { describe, expect, it } from 'vitest';
import { calculateScore } from '@/game/scoring';

const base = {
  alive: true,
  scienceDelivered: 120,
  scienceTarget: 100,
  budget: 800,
  budgetLeft: 55,
  difficultyMultiplier: 1.5,
  safeModeTurns: 0,
  damagedComponents: 0,
};

describe('calculateScore', () => {
  it('sucesso com pouca sobra dá 2 estrelas', () => {
    const r = calculateScore(base);
    expect(r.outcome).toBe('success');
    expect(r.stars).toBe(2);
    expect(r.score).toBe(Math.round(120 * (1 + (55 / 800) * 0.5) * 1.5));
  });

  it('sucesso com 20% de sobra dá 3 estrelas', () => {
    expect(calculateScore({ ...base, budgetLeft: 160 }).stars).toBe(3);
  });

  it('abaixo da meta é parcial', () => {
    expect(calculateScore({ ...base, scienceDelivered: 40 })).toMatchObject({ outcome: 'partial', stars: 1 });
  });

  it('nave perdida acima da meta continua parcial', () => {
    expect(calculateScore({ ...base, alive: false }).outcome).toBe('partial');
  });

  it('sem ciência é falha', () => {
    expect(calculateScore({ ...base, alive: false, scienceDelivered: 0 })).toMatchObject({ outcome: 'failure', stars: 0, score: 0 });
  });

  it('desconta modo seguro e componentes danificados', () => {
    const clean = calculateScore(base).score;
    expect(calculateScore({ ...base, safeModeTurns: 2, damagedComponents: 1 }).score).toBe(clean - 20);
  });
});
