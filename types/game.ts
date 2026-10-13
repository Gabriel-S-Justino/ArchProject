export type Category = 'power' | 'comms' | 'propulsion' | 'protection' | 'avionics' | 'instrument';
export type TestKind = 'launch' | 'radiation' | 'micrometeoroid' | 'avionics' | 'power' | 'thermal' | 'propulsion';
export type Phase = 'briefing' | 'design' | 'launch' | 'cruise' | 'arrival' | 'operations' | 'report';
export type FlightPhase = 'cruise' | 'operations';
export type LauncherKey = 'leo' | 'moon' | 'mars';

export interface Mission {
  id: string;
  name: string;
  briefing: string;
  distanceAU: number;
  budget: number;
  launcherKey: LauncherKey;
  requiredDeltaV: number;
  insertionDeltaV: number;
  cruiseTurns: number;
  operationsTurns: number;
  scienceTarget: number;
  requires: { minInstruments: number; categories: Category[] };
  difficultyMultiplier: number;
  gameBalance: true;
}

export interface Launcher {
  id: string;
  name: string;
  cost: number;
  capacity: Record<LauncherKey, number>;
  reliability: number;
  flavor: string;
  gameBalance: true;
}

export interface ComponentCard {
  id: string;
  name: string;
  category: Category;
  cost: number;
  mass: number;
  power: number;
  solar?: boolean;
  batteryW?: number;
  propellant?: number;
  isp?: number;
  extraCruiseTurns?: number;
  cruiseOnlyPower?: number;
  downlinkAt1AU?: number;
  science?: number;
  data?: number;
  testBonus?: Partial<Record<TestKind | 'all', number>>;
  maxCopies?: number;
  tags: string[];
  flavor: string;
  gameBalance: true;
}

export interface CrewCard {
  id: string;
  name: string;
  passive: string;
  active: string | null;
}

export interface EventCard {
  id: string;
  name: string;
  phases: FlightPhase[];
  test?: TestKind;
  difficulty?: number;
  copies: number;
  text: string;
  failText?: string;
}

export interface ActionCard {
  id: string;
  name: string;
  copies: number;
  text: string;
}

export interface CardCatalog {
  launchers: Launcher[];
  components: ComponentCard[];
  crew: CrewCard[];
  events: EventCard[];
  actions: ActionCard[];
}

export interface Design {
  launcherId?: string;
  componentIds: string[];
  crewIds: string[];
}

export interface ShipComponent {
  uid: string;
  id: string;
  active: boolean;
  damaged: boolean;
  offUntilTurn?: number;
  powerFactor: number;
}

export interface Modifier {
  id: string;
  untilTurn: number;
  effect: 'generationHalf' | 'testBonus' | 'downlinkBoost' | 'scienceDouble' | 'flushBuffer';
  value?: number;
}

export interface ShipState {
  components: ShipComponent[];
  deltaV: number;
  buffer: { data: number; science: number };
  scienceDelivered: number;
  safeModeStreak: number;
  safeModeTurns: number;
  dataLost: number;
  alive: boolean;
  modifiers: Modifier[];
}

export interface MissionEvent {
  code: string;
  turn: number;
  phase: Phase;
  title: string;
  roll?: number;
  bonus?: number;
  total?: number;
  difficulty?: number;
  success?: boolean;
  explanation: string;
}

export interface TurnSnapshot {
  turn: number;
  phase: Phase;
  generation: number;
  consumption: number;
  downlink: number;
  scienceDelivered: number;
  deltaV: number;
}

export type Outcome = 'success' | 'partial' | 'failure';

export interface MissionResult {
  outcome: Outcome;
  stars: 0 | 1 | 2 | 3;
  score: number;
  scienceDelivered: number;
  budgetLeft: number;
  timeline: TurnSnapshot[];
  log: MissionEvent[];
  lessons: string[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface DesignStats {
  totalCost: number;
  budget: number;
  dryMass: number;
  propellant: number;
  totalMass: number;
  capacity: number;
  isp: number;
  deltaV: number;
  generation: number;
  consumptionCruise: number;
  consumptionOps: number;
  batteryW: number;
  downlink: number;
  sciencePerTurn: number;
  dataPerTurn: number;
  cruiseTurns: number;
  testBonus: Record<TestKind, number>;
}

export interface GameState {
  phase: Phase;
  seed: number;
  mission: Mission;
  design: Design;
  stats: DesignStats;
  ship: ShipState;
  turn: number;
  phaseTurn: number;
  arrivalAttempts: number;
  arrivalBonus: number;
  hand: string[];
  usedAbilities: string[];
  pendingEvent?: string;
  log: MissionEvent[];
  timeline: TurnSnapshot[];
  result?: MissionResult;
}
