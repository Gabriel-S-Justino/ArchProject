import type {
  ComponentCard,
  Design,
  EventCard,
  FlightPhase,
  GameState,
  Mission,
  MissionEvent,
  Phase,
  ShipState,
  TestKind,
} from '@/types/game';
import { catalog } from './catalog';
import {
  ARRIVAL_DELTAV_PENALTY,
  ARRIVAL_DIFFICULTY,
  BUFFER_MAX,
  BUS_POWER,
  DISCOVERY_SCIENCE,
  HAND_MAX,
  HAND_START,
  LAUNCH_DELTAV_PENALTY,
  LAUNCH_DIFFICULTY,
  LAUNCH_LOSS_MARGIN,
  MAX_ARRIVAL_ATTEMPTS,
  TRAJECTORY_CORRECTION_BONUS,
  TRAJECTORY_CORRECTION_COST,
} from './constants';
import { calculateDesign, downlinkAt, generationAt, hasCrew } from './design';
import { drawAction, drawEvent } from './events';
import { buildLessons } from './lessons';
import { pick, rngFor } from './rng';
import { calculateScore } from './scoring';
import { rollTest, type TestRoll } from './tests';
import { canLaunch, fmt, validateDesign } from './validation';

export interface TurnChoices {
  /** Action card from the hand to play this turn. */
  actionId?: string;
  /** Crew members whose active ability is used this turn. */
  abilities?: string[];
}

export function emptyDesign(): Design {
  return { componentIds: [], crewIds: [] };
}

function emptyShip(): ShipState {
  return {
    components: [],
    deltaV: 0,
    buffer: { data: 0, science: 0 },
    scienceDelivered: 0,
    safeModeStreak: 0,
    safeModeTurns: 0,
    dataLost: 0,
    alive: true,
    modifiers: [],
  };
}

export function createGame(mission: Mission, seed: number, design: Design = emptyDesign()): GameState {
  return {
    phase: 'briefing',
    seed,
    mission,
    design,
    stats: calculateDesign(mission, design),
    ship: emptyShip(),
    turn: 0,
    phaseTurn: 0,
    arrivalAttempts: 0,
    arrivalBonus: 0,
    hand: [],
    usedAbilities: [],
    log: [],
    timeline: [],
  };
}

export function updateDesign(state: GameState, design: Design): GameState {
  return { ...state, design, stats: calculateDesign(state.mission, design) };
}

export function card(id: string): ComponentCard {
  const found = catalog.components.find((c) => c.id === id);
  if (!found) throw new Error(`Carta desconhecida: ${id}`);
  return found;
}

export function startMission(state: GameState): GameState {
  if (!canLaunch(validateDesign(state.mission, state.design))) {
    throw new Error('O projeto da nave tem erros e não pode ser lançado.');
  }
  const s = structuredClone(state);
  s.stats = calculateDesign(s.mission, s.design);
  s.ship = emptyShip();
  s.ship.components = s.design.componentIds.map((id, i) => ({
    uid: `${id}-${i}`,
    id,
    active: true,
    damaged: false,
    powerFactor: 1,
  }));
  s.ship.deltaV = s.stats.deltaV;
  s.hand = Array.from({ length: HAND_START }, (_, i) => drawAction(s.seed, i));
  s.turn = 0;
  s.phaseTurn = 0;
  s.arrivalAttempts = 0;
  s.arrivalBonus = 0;
  s.usedAbilities = [];
  s.log = [];
  s.timeline = [];
  s.result = undefined;
  s.phase = 'launch';
  return s;
}

/** Test bonus counting only components that still work. */
export function liveTestBonus(state: GameState, kind: TestKind): number {
  const working = state.ship.components.filter((c) => !c.damaged).map((c) => c.id);
  return calculateDesign(state.mission, { ...state.design, componentIds: working }).testBonus[kind];
}

export function canUseAbility(state: GameState, crewId: string, phase: Phase = state.phase): boolean {
  const crew = catalog.crew.find((c) => c.id === crewId);
  return Boolean(crew?.active) && hasCrew(state.design, crewId) && !state.usedAbilities.includes(`${crewId}:${phase}`);
}

function useAbility(s: GameState, crewId: string, requested: string[] | undefined, phase: Phase = s.phase): boolean {
  if (!requested?.includes(crewId) || !canUseAbility(s, crewId, phase)) return false;
  s.usedAbilities.push(`${crewId}:${phase}`);
  const crew = catalog.crew.find((c) => c.id === crewId)!;
  log(s, { code: 'ability', title: crew.name, explanation: crew.active ?? '' });
  return true;
}

function log(s: GameState, entry: Omit<MissionEvent, 'turn' | 'phase'> & { phase?: Phase }) {
  s.log.push({ turn: s.turn, phase: s.phase, ...entry });
}

function logRoll(s: GameState, code: string, title: string, r: TestRoll, explanation: string) {
  log(s, { code, title, roll: r.roll, bonus: r.bonus, total: r.total, difficulty: r.difficulty, success: r.success, explanation });
}

function snapshot(s: GameState, generation: number, consumption: number, downlink: number) {
  s.timeline.push({
    turn: s.turn,
    phase: s.phase,
    generation,
    consumption,
    downlink,
    scienceDelivered: s.ship.scienceDelivered,
    deltaV: s.ship.deltaV,
  });
}

export function resolveLaunch(state: GameState, choices: TurnChoices = {}): GameState {
  if (state.phase !== 'launch') throw new Error('Não é hora do lançamento.');
  const s = structuredClone(state);
  const bonus = liveTestBonus(s, 'launch');
  let r = rollTest(rngFor(s.seed, 'launch', 'roll'), bonus, LAUNCH_DIFFICULTY);
  if (!r.success && useAbility(s, 'crew-flight', choices.abilities)) {
    r = rollTest(rngFor(s.seed, 'launch', 'reroll'), bonus, LAUNCH_DIFFICULTY);
  }

  if (r.success) {
    logRoll(s, 'launch', 'Lançamento', r, 'O foguete colocou a nave na trajetória para o destino.');
  } else if (r.difficulty - r.total >= LAUNCH_LOSS_MARGIN) {
    s.ship.alive = false;
    logRoll(s, 'launch-lost', 'Lançamento', r, 'O foguete falhou e a nave foi perdida.');
  } else {
    s.ship.deltaV -= LAUNCH_DELTAV_PENALTY;
    logRoll(s, 'launch-partial', 'Lançamento', r, `Órbita imprecisa: a nave gastou ${LAUNCH_DELTAV_PENALTY} m/s para corrigir.`);
  }
  snapshot(s, 0, 0, 0);

  if (!s.ship.alive) return finishMission(s);
  s.phase = 'cruise';
  s.phaseTurn = 0;
  return s;
}

/** The event the next flight turn will face, so the player can decide before playing. */
export function peekEvent(state: GameState): EventCard | undefined {
  if (state.phase !== 'cruise' && state.phase !== 'operations') return undefined;
  return drawEvent(state.seed, state.phase, state.turn + 1);
}

export function playTurn(state: GameState, choices: TurnChoices = {}): GameState {
  if (state.phase !== 'cruise' && state.phase !== 'operations') throw new Error('Não é um turno de voo.');
  const s = structuredClone(state);
  const phase: FlightPhase = s.phase as FlightPhase;
  const d = s.mission.distanceAU;
  s.turn += 1;
  s.phaseTurn += 1;
  const t = s.turn;
  s.ship.modifiers = s.ship.modifiers.filter((m) => m.untilTurn >= t);

  // Action card.
  let safeMode = false;
  let eventCancelled = false;
  let instrumentsOff = false;
  let downlinkMult = 1;
  if (choices.actionId) {
    const index = s.hand.indexOf(choices.actionId);
    if (index === -1) throw new Error('Essa carta de ação não está na mão.');
    s.hand.splice(index, 1);
    const action = catalog.actions.find((a) => a.id === choices.actionId)!;
    log(s, { code: 'action', title: action.name, explanation: action.text });
    if (action.id === 'trajectory-correction') {
      s.ship.deltaV -= TRAJECTORY_CORRECTION_COST;
      s.arrivalBonus += TRAJECTORY_CORRECTION_BONUS;
    } else if (action.id === 'safe-mode') {
      safeMode = true;
      eventCancelled = true;
      s.ship.safeModeTurns += 1;
    } else if (action.id === 'prioritize-downlink') {
      downlinkMult = 1.5;
      instrumentsOff = true;
    } else if (action.id === 'power-down-instruments') {
      instrumentsOff = true;
    }
  }

  // Crew abilities.
  const scienceDouble = useAbility(s, 'crew-science', choices.abilities);
  const flush = useAbility(s, 'crew-comms', choices.abilities);
  if (useAbility(s, 'crew-systems', choices.abilities)) {
    for (const c of s.ship.components) c.offUntilTurn = undefined;
  }
  const flags = {
    reroll: () => useAbility(s, 'crew-flight', choices.abilities),
    ignoreRadiation: () => useAbility(s, 'crew-radiation', choices.abilities),
  };

  // Event.
  const event = drawEvent(s.seed, phase, t);
  s.pendingEvent = event.id;
  let discovery = false;
  if (eventCancelled) {
    log(s, { code: `event-${event.id}`, title: event.name, explanation: 'O modo seguro protegeu a nave e o evento não teve efeito.' });
  } else if (!event.test) {
    if (event.id === 'unexpected-discovery') discovery = true;
    else log(s, { code: `event-${event.id}`, title: event.name, explanation: event.text });
  } else {
    if (resolveEventTest(s, event, phase, flags) === 'safe-mode') {
      safeMode = true;
      s.ship.safeModeTurns += 1;
    }
  }

  // Energy.
  const isOn = (c: { damaged: boolean; offUntilTurn?: number }) => !c.damaged && (c.offUntilTurn === undefined || c.offUntilTurn < t);
  const live = s.ship.components.filter(isOn).map((c) => ({ ship: c, card: card(c.id) }));
  const halved = s.ship.modifiers.some((m) => m.effect === 'generationHalf');
  const generation = live.reduce((sum, c) => sum + generationAt(c.card, d) * c.ship.powerFactor, 0) * (halved ? 0.5 : 1);
  const battery = live.reduce((sum, c) => sum + (c.card.batteryW ?? 0), 0);
  const drawOf = (c: ComponentCard) => (c.power < 0 ? -c.power : 0);
  const essential =
    BUS_POWER +
    live.filter((c) => c.card.category !== 'instrument' && c.card.category !== 'comms').reduce((sum, c) => sum + drawOf(c.card), 0) +
    (phase === 'cruise' ? live.reduce((sum, c) => sum + -(c.card.cruiseOnlyPower ?? 0), 0) : 0);
  const available = generation + battery;

  const hasAvionics = live.some((c) => c.card.category === 'avionics');
  let powerFailure = false;
  if (!hasAvionics) {
    powerFailure = true;
    log(s, { code: 'no-avionics', title: 'Sem computador', explanation: 'Nenhum computador funciona: a nave fica em modo seguro.' });
  } else if (available < essential) {
    powerFailure = true;
    log(s, {
      code: 'power-safe-mode',
      title: 'Pane de energia',
      explanation: `A nave precisa de ${fmt(essential)} W só para se manter, mas tem ${fmt(available)} W. Modo seguro.`,
    });
  }
  if (powerFailure) {
    safeMode = true;
    s.ship.safeModeStreak += 1;
    s.ship.safeModeTurns += 1;
    if (s.ship.safeModeStreak >= 2) {
      s.ship.alive = false;
      log(s, { code: 'ship-lost', title: 'Nave perdida', explanation: 'Dois turnos seguidos sem energia para o básico: o controle perdeu a nave.' });
    }
  } else {
    s.ship.safeModeStreak = 0;
  }

  let remaining = safeMode ? 0 : available - essential;
  const comms = safeMode ? [] : live.filter((c) => c.card.category === 'comms');
  const commsDraw = comms.reduce((sum, c) => sum + drawOf(c.card), 0);
  let commsOn = comms.length > 0;
  if (commsOn && commsDraw > remaining) {
    commsOn = false;
    log(s, { code: 'power-shed-comms', title: 'Antena desligada', explanation: 'Não havia energia para transmitir neste turno.' });
  }
  if (commsOn) remaining -= commsDraw;

  let instruments =
    phase === 'operations' && !safeMode && !instrumentsOff ? live.filter((c) => c.card.category === 'instrument') : [];
  instruments.sort((a, b) => drawOf(b.card) - drawOf(a.card));
  const shed: string[] = [];
  while (instruments.length && instruments.reduce((sum, c) => sum + drawOf(c.card), 0) > remaining) {
    shed.push(instruments.shift()!.card.name);
  }
  if (shed.length) {
    log(s, { code: 'power-shed', title: 'Energia insuficiente', explanation: `Desligados para economizar energia: ${shed.join(', ')}.` });
  }
  const instrumentsDraw = instruments.reduce((sum, c) => sum + drawOf(c.card), 0);
  const consumption = safeMode ? Math.min(essential, available) : essential + (commsOn ? commsDraw : 0) + instrumentsDraw;

  // Science.
  if (instruments.length) {
    const scienceBonus = hasCrew(s.design, 'crew-science') ? 1 : 0;
    let science = instruments.reduce((sum, c) => sum + (c.card.science ?? 0) + scienceBonus, 0);
    if (scienceDouble) science *= 2;
    s.ship.buffer.science += science;
    s.ship.buffer.data += instruments.reduce((sum, c) => sum + (c.card.data ?? 0), 0);
  }

  // Downlink.
  let capacity = commsOn
    ? comms.reduce((sum, c) => sum + downlinkAt(c.card, d), 0) * (hasCrew(s.design, 'crew-comms') ? 1.2 : 1) * downlinkMult
    : 0;
  if (flush && capacity > 0) capacity = Math.max(capacity, s.ship.buffer.data);
  const sent = Math.min(s.ship.buffer.data, capacity);
  if (s.ship.buffer.data > 0 && sent > 0) {
    const share = sent / s.ship.buffer.data;
    s.ship.scienceDelivered += s.ship.buffer.science * share;
    s.ship.buffer.science -= s.ship.buffer.science * share;
    s.ship.buffer.data -= sent;
  }
  if (s.ship.buffer.data > BUFFER_MAX) {
    const excess = s.ship.buffer.data - BUFFER_MAX;
    s.ship.buffer.science *= BUFFER_MAX / s.ship.buffer.data;
    s.ship.buffer.data = BUFFER_MAX;
    s.ship.dataLost += excess;
    log(s, {
      code: 'buffer-overflow',
      title: 'Memória cheia',
      explanation: `A memória de bordo encheu e ${fmt(excess, 1)} Gbit de dados foram descartados.`,
    });
  }

  if (discovery) {
    const spareLink = capacity - sent;
    const sparePower = available - consumption;
    if (!safeMode && sparePower >= 50 && spareLink >= 2) {
      s.ship.scienceDelivered += DISCOVERY_SCIENCE;
      log(s, {
        code: 'discovery',
        title: 'Descoberta inesperada',
        success: true,
        explanation: `Com energia e banda sobrando, a equipe investigou e ganhou +${DISCOVERY_SCIENCE} de ciência.`,
      });
    } else {
      log(s, {
        code: 'discovery-missed',
        title: 'Descoberta inesperada',
        success: false,
        explanation: 'Sem energia ou banda sobrando, a oportunidade passou.',
      });
    }
  }

  snapshot(s, generation, consumption, sent);

  if (s.hand.length < HAND_MAX) s.hand.push(drawAction(s.seed, HAND_START + t - 1));

  if (!s.ship.alive) return finishMission(s);
  if (phase === 'cruise' && s.phaseTurn >= s.stats.cruiseTurns) {
    s.phase = 'arrival';
    s.phaseTurn = 0;
  } else if (phase === 'operations' && s.phaseTurn >= s.mission.operationsTurns) {
    return finishMission(s);
  }
  return s;
}

function resolveEventTest(
  s: GameState,
  event: EventCard,
  phase: FlightPhase,
  flags: { reroll: () => boolean; ignoreRadiation: () => boolean },
): 'ok' | 'safe-mode' {
  const kind = event.test!;
  const t = s.turn;
  const bonus = liveTestBonus(s, kind);
  let r = rollTest(rngFor(s.seed, phase, t, 'roll'), bonus, event.difficulty!);
  if (!r.success && flags.reroll()) r = rollTest(rngFor(s.seed, phase, t, 'reroll'), bonus, event.difficulty!);
  const code = `event-${event.id}`;
  if (r.success) {
    logRoll(s, code, event.name, r, `${event.text} A nave resistiu.`);
    return 'ok';
  }
  if (kind === 'radiation' && flags.ignoreRadiation()) {
    logRoll(s, code, event.name, { ...r, success: true }, `${event.text} A Especialista em Radiação evitou o dano.`);
    return 'ok';
  }

  const target = rngFor(s.seed, phase, t, 'target');
  let explanation = `${event.text} ${event.failText ?? ''}`.trim();
  let result: 'ok' | 'safe-mode' = 'ok';
  if (event.id === 'solar-storm') {
    s.ship.modifiers.push({ id: 'solar-storm', untilTurn: t + 1, effect: 'generationHalf' });
  } else if (event.id === 'micrometeoroid') {
    const candidates = s.ship.components.filter((c) => !c.damaged);
    if (candidates.length) {
      const hit = pick(target, candidates);
      hit.damaged = true;
      explanation = `${event.text} Atingiu: ${card(hit.id).name}, que parou de funcionar.`;
    }
  } else if (event.id === 'computer-glitch') {
    result = 'safe-mode';
  } else if (event.id === 'panel-degradation') {
    const panels = s.ship.components
      .filter((c) => !c.damaged && card(c.id).solar)
      .sort((a, b) => card(b.id).power * b.powerFactor - card(a.id).power * a.powerFactor);
    if (panels.length) panels[0].powerFactor *= 0.5;
    else explanation = `${event.text} Como a nave não usa painéis solares, nada aconteceu.`;
  } else if (event.id === 'overheating') {
    const instruments = s.ship.components.filter((c) => !c.damaged && card(c.id).category === 'instrument');
    if (instruments.length) {
      const hot = pick(target, instruments);
      hot.offUntilTurn = t;
      explanation = `${event.text} ${card(hot.id).name} desligou por 1 turno.`;
    }
  }
  logRoll(s, code, event.name, r, explanation);
  return result;
}

export function resolveArrival(state: GameState, choices: TurnChoices = {}): GameState {
  if (state.phase !== 'arrival') throw new Error('Não é hora da chegada.');
  const s = structuredClone(state);
  s.turn += 1;
  const need = s.mission.insertionDeltaV;
  if (s.ship.deltaV < need) {
    s.ship.alive = false;
    log(s, {
      code: 'arrival-no-deltav',
      title: 'Inserção orbital',
      success: false,
      explanation: `Faltou propelente: a inserção exige ${fmt(need)} m/s e restavam ${fmt(s.ship.deltaV)} m/s. A nave passou direto pelo destino.`,
    });
    snapshot(s, 0, 0, 0);
    return finishMission(s);
  }

  const bonus = liveTestBonus(s, 'propulsion') + s.arrivalBonus;
  let r = rollTest(rngFor(s.seed, 'arrival', s.arrivalAttempts, 'roll'), bonus, ARRIVAL_DIFFICULTY);
  if (!r.success && useAbility(s, 'crew-flight', choices.abilities)) {
    r = rollTest(rngFor(s.seed, 'arrival', s.arrivalAttempts, 'reroll'), bonus, ARRIVAL_DIFFICULTY);
  }
  if (r.success) {
    s.ship.deltaV -= need;
    logRoll(s, 'arrival', 'Inserção orbital', r, 'Queima perfeita: a nave entrou em órbita.');
    snapshot(s, 0, 0, 0);
    s.phase = 'operations';
    s.phaseTurn = 0;
    return s;
  }

  s.ship.deltaV -= ARRIVAL_DELTAV_PENALTY;
  s.arrivalAttempts += 1;
  if (s.arrivalAttempts >= MAX_ARRIVAL_ATTEMPTS) {
    s.ship.alive = false;
    logRoll(s, 'arrival-lost', 'Inserção orbital', r, 'A segunda tentativa também falhou. A nave se perdeu no espaço.');
    snapshot(s, 0, 0, 0);
    return finishMission(s);
  }
  logRoll(s, 'arrival-retry', 'Inserção orbital', r, `A queima saiu errada e gastou ${ARRIVAL_DELTAV_PENALTY} m/s. Mais uma tentativa no próximo turno.`);
  snapshot(s, 0, 0, 0);
  return s;
}

export function finishMission(state: GameState): GameState {
  const s = structuredClone(state);
  s.phase = 'report';
  const budgetLeft = s.stats.budget - s.stats.totalCost;
  const score = calculateScore({
    alive: s.ship.alive,
    scienceDelivered: s.ship.scienceDelivered,
    scienceTarget: s.mission.scienceTarget,
    budget: s.stats.budget,
    budgetLeft,
    difficultyMultiplier: s.mission.difficultyMultiplier,
    safeModeTurns: s.ship.safeModeTurns,
    damagedComponents: s.ship.components.filter((c) => c.damaged).length,
  });
  s.result = {
    ...score,
    scienceDelivered: Math.round(s.ship.scienceDelivered * 10) / 10,
    budgetLeft,
    timeline: s.timeline,
    log: s.log,
    lessons: buildLessons(s, score.outcome),
  };
  return s;
}
