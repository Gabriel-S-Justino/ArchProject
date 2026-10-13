import type { CardCatalog, EventCard, FlightPhase } from '@/types/game';
import { catalog as defaultCatalog } from './catalog';
import { pick, rngFor } from './rng';

export function eventDeck(phase: FlightPhase, catalog: CardCatalog = defaultCatalog): EventCard[] {
  return catalog.events.filter((e) => e.phases.includes(phase)).flatMap((e) => Array.from({ length: e.copies }, () => e));
}

/**
 * The event for a turn depends only on seed, phase and turn, never on the design,
 * so the "E se?" comparison faces the same events.
 */
export function drawEvent(seed: number, phase: FlightPhase, turn: number, catalog: CardCatalog = defaultCatalog): EventCard {
  return pick(rngFor(seed, phase, turn, 'event'), eventDeck(phase, catalog));
}

export function drawAction(seed: number, index: number, catalog: CardCatalog = defaultCatalog): string {
  const deck = catalog.actions.flatMap((a) => Array.from({ length: a.copies }, () => a.id));
  return pick(rngFor(seed, 'action', index), deck);
}
