import { describe, expect, it } from 'vitest';
import { deriveSeed, mulberry32 } from '@/game/rng';
import { rollTest } from '@/game/tests';

const fixed = (value: number) => () => value;

describe('rng', () => {
  it('é determinístico', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('separa fluxos por partes da semente', () => {
    expect(deriveSeed(1, 'cruise', 1)).not.toBe(deriveSeed(1, 'cruise', 2));
    expect(deriveSeed(1, 'cruise', 1)).toBe(deriveSeed(1, 'cruise', 1));
  });
});

describe('rollTest', () => {
  it('1 natural sempre falha', () => {
    expect(rollTest(fixed(0), 50, 5)).toMatchObject({ roll: 1, success: false });
  });

  it('20 natural sempre passa', () => {
    expect(rollTest(fixed(0.99), -50, 30)).toMatchObject({ roll: 20, success: true });
  });

  it('passa no limite exato da dificuldade', () => {
    const r = rollTest(fixed(0.45), 1, 11);
    expect(r.roll).toBe(10);
    expect(r.success).toBe(true);
    expect(rollTest(fixed(0.45), 0, 11).success).toBe(false);
  });
});
