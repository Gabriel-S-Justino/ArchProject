import { describe, expect, it } from 'vitest';
import { simulateMission } from '@/game/simulation';
import type { Design } from '@/types/game';
import { mars, referenceDesign, withSwap } from './fixtures';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function run(design: Design) {
  const results = SEEDS.map((seed) => simulateMission(mars, design, seed));
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  const science = results.reduce((sum, r) => sum + r.scienceDelivered, 0) / results.length;
  return { success: count('success'), partial: count('partial'), science };
}

describe('balanceamento (Arquitetura.md, seção 17)', () => {
  const reference = run(referenceDesign);

  it('a nave de referência vence em pelo menos 60% das seeds', () => {
    expect(reference.success).toBeGreaterThanOrEqual(120);
  });

  it('com antena de baixo ganho a maioria fica em parcial', () => {
    expect(run(withSwap(referenceDesign, 'antenna-high', 'antenna-low')).partial).toBeGreaterThan(100);
  });

  it('com painel pequeno a ciência cai', () => {
    expect(run(withSwap(referenceDesign, 'solar-large', 'solar-small')).science).toBeLessThan(reference.science * 0.8);
  });
});
