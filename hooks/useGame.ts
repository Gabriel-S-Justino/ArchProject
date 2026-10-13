'use client';

import { useReducer } from 'react';
import { CREW_SIZE } from '@/game/constants';
import { createGame, playTurn, resolveArrival, resolveLaunch, startMission, updateDesign } from '@/game/turn';
import { getMission } from '@/game/catalog';
import type { GameState } from '@/types/game';

export type GameAction =
  | { type: 'SELECT_MISSION'; missionId: string }
  | { type: 'TOGGLE_CREW'; crewId: string }
  | { type: 'BEGIN_DESIGN' }
  | { type: 'BACK_TO_BRIEFING' }
  | { type: 'SELECT_LAUNCHER'; launcherId: string }
  | { type: 'ADD_COMPONENT'; componentId: string }
  | { type: 'REMOVE_COMPONENT'; componentId: string }
  | { type: 'LAUNCH'; seed: number }
  | { type: 'PLAY_TURN'; actionId?: string; abilities?: string[] }
  | { type: 'ARRIVE'; abilities?: string[] }
  | { type: 'RETRY'; sameSeed: boolean }
  | { type: 'RESTART' };

const DEFAULT_MISSION = 'red-watch';

/** Seed 0 means "not drawn yet": a new seed is drawn when the mission launches. */
const UNSET_SEED = 0;

export function newSeed(): number {
  return (Date.now() % 1_000_000_006) + 1;
}

function reducer(state: GameState, action: GameAction): GameState {
  const design = state.design;
  switch (action.type) {
    case 'SELECT_MISSION':
      return createGame(getMission(action.missionId), state.seed, design);
    case 'TOGGLE_CREW': {
      const has = design.crewIds.includes(action.crewId);
      if (!has && design.crewIds.length >= CREW_SIZE) return state;
      const crewIds = has ? design.crewIds.filter((id) => id !== action.crewId) : [...design.crewIds, action.crewId];
      return updateDesign(state, { ...design, crewIds });
    }
    case 'BEGIN_DESIGN':
      return design.crewIds.length === CREW_SIZE ? { ...state, phase: 'design' } : state;
    case 'BACK_TO_BRIEFING':
      return { ...state, phase: 'briefing' };
    case 'SELECT_LAUNCHER':
      return updateDesign(state, { ...design, launcherId: action.launcherId });
    case 'ADD_COMPONENT':
      return updateDesign(state, { ...design, componentIds: [...design.componentIds, action.componentId] });
    case 'REMOVE_COMPONENT': {
      const index = design.componentIds.lastIndexOf(action.componentId);
      if (index === -1) return state;
      const componentIds = design.componentIds.filter((_, i) => i !== index);
      return updateDesign(state, { ...design, componentIds });
    }
    case 'LAUNCH':
      return resolveLaunch(startMission({ ...state, seed: state.seed === UNSET_SEED ? action.seed : state.seed }));
    case 'PLAY_TURN':
      return playTurn(state, { actionId: action.actionId, abilities: action.abilities });
    case 'ARRIVE':
      return resolveArrival(state, { abilities: action.abilities });
    case 'RETRY':
      return { ...createGame(state.mission, action.sameSeed ? state.seed : UNSET_SEED, design), phase: 'design' };
    case 'RESTART':
      return createGame(state.mission, UNSET_SEED);
  }
}

export function useGame() {
  return useReducer(reducer, undefined, () => createGame(getMission(DEFAULT_MISSION), UNSET_SEED));
}
