import type { Design, EventCard, GameState, Mission, MissionResult } from '@/types/game';
import { createGame, peekEvent, playTurn, resolveArrival, resolveLaunch, startMission, type TurnChoices } from './turn';

export type Policy = (state: GameState, nextEvent: EventCard | undefined) => TurnChoices;

/** Plays no action cards and uses no abilities. */
export const autoPolicy: Policy = () => ({});

/** Runs a whole mission without interaction. Same inputs, same result. */
export function simulateMission(mission: Mission, design: Design, seed: number, policy: Policy = autoPolicy): MissionResult {
  let s = startMission(createGame(mission, seed, design));
  s = resolveLaunch(s, policy(s, undefined));
  for (let guard = 0; s.phase !== 'report' && guard < 100; guard++) {
    if (s.phase === 'arrival') s = resolveArrival(s, policy(s, undefined));
    else s = playTurn(s, policy(s, peekEvent(s)));
  }
  if (!s.result) throw new Error('A simulação não terminou.');
  return s.result;
}
