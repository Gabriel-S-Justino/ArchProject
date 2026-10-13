import { describe, expect, it } from 'vitest';
import { drawEvent } from '@/game/events';
import { autoPolicy, simulateMission } from '@/game/simulation';
import { createGame, peekEvent, playTurn, resolveArrival, startMission } from '@/game/turn';
import type { Design, GameState } from '@/types/game';
import { mars, referenceDesign, withSwap } from './fixtures';

function seedWhere(phase: 'cruise' | 'operations', eventId: string, turns = [1]): number {
  for (let seed = 1; seed < 10000; seed++) {
    if (turns.every((t) => drawEvent(seed, phase, t).id === eventId)) return seed;
  }
  throw new Error('seed não encontrada');
}

function inOperations(design: Design, seed: number): GameState {
  const s = startMission(createGame(mars, seed, design));
  return { ...s, phase: 'operations', phaseTurn: 0 };
}

describe('startMission', () => {
  it('recusa um projeto inválido', () => {
    expect(() => startMission(createGame(mars, 1))).toThrow();
  });

  it('monta a nave e a mão inicial', () => {
    const s = startMission(createGame(mars, 1, referenceDesign));
    expect(s.phase).toBe('launch');
    expect(s.ship.components).toHaveLength(referenceDesign.componentIds.length);
    expect(s.hand).toHaveLength(3);
  });
});

describe('playTurn', () => {
  it('desliga primeiro o instrumento que mais consome quando falta energia', () => {
    const seed = seedWhere('operations', 'quiet-sky');
    const s = playTurn(inOperations(withSwap(referenceDesign, 'solar-large', 'solar-small'), seed));
    const shed = s.log.find((e) => e.code === 'power-shed');
    expect(shed?.explanation).toContain('Radar de sondagem');
    expect(shed?.explanation).not.toContain('Câmera');
  });

  it('perde a nave após dois turnos seguidos sem energia', () => {
    const seed = seedWhere('operations', 'quiet-sky', [1, 2]);
    let s = inOperations(referenceDesign, seed);
    s.ship.components.forEach((c) => {
      if (c.id === 'solar-large' || c.id === 'battery') c.damaged = true;
    });
    s = playTurn(s);
    expect(s.ship.alive).toBe(true);
    expect(s.ship.safeModeStreak).toBe(1);
    s = playTurn(s);
    expect(s.ship.alive).toBe(false);
    expect(s.phase).toBe('report');
    expect(s.log.some((e) => e.code === 'ship-lost')).toBe(true);
  });

  it('descarta dados quando a memória de bordo enche', () => {
    const r = simulateMission(mars, withSwap(referenceDesign, 'antenna-high', 'antenna-low'), 3);
    expect(r.log.some((e) => e.code === 'buffer-overflow')).toBe(true);
    expect(r.lessons.some((l) => l.includes('memória'))).toBe(true);
  });

  it('modo seguro cancela o evento do turno', () => {
    const seed = seedWhere('operations', 'solar-storm');
    const s = inOperations(referenceDesign, seed);
    s.hand = ['safe-mode'];
    const next = playTurn(s, { actionId: 'safe-mode' });
    expect(next.ship.modifiers).toHaveLength(0);
    expect(next.ship.scienceDelivered).toBe(0);
  });

  it('recusa carta que não está na mão', () => {
    const s = inOperations(referenceDesign, 1);
    s.hand = [];
    expect(() => playTurn(s, { actionId: 'safe-mode' })).toThrow();
  });

  it('peekEvent mostra o evento que o turno vai enfrentar', () => {
    const s = inOperations(referenceDesign, 11);
    const event = peekEvent(s)!;
    expect(playTurn(s).pendingEvent).toBe(event.id);
  });
});

describe('resolveArrival', () => {
  it('falha sem delta-v para a inserção', () => {
    const s = startMission(createGame(mars, 1, referenceDesign));
    const r = resolveArrival({ ...s, phase: 'arrival', ship: { ...s.ship, deltaV: 1000 } });
    expect(r.phase).toBe('report');
    expect(r.result?.outcome).toBe('failure');
    expect(r.result?.lessons.some((l) => l.includes('propelente'))).toBe(true);
  });
});

describe('simulateMission', () => {
  it('é determinística', () => {
    expect(simulateMission(mars, referenceDesign, 99)).toEqual(simulateMission(mars, referenceDesign, 99));
  });

  it('o evento de cada turno não depende do projeto', () => {
    const a = simulateMission(mars, referenceDesign, 5, autoPolicy).log.filter((e) => e.code.startsWith('event-')).map((e) => `${e.turn}${e.title}`);
    const b = simulateMission(mars, withSwap(referenceDesign, 'radar-sounder', 'ir-thermometer'), 5).log.filter((e) => e.code.startsWith('event-')).map((e) => `${e.turn}${e.title}`);
    expect(a).toEqual(b);
  });
});
