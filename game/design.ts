import type { CardCatalog, ComponentCard, Design, DesignStats, Mission, TestKind } from '@/types/game';
import { catalog as defaultCatalog } from './catalog';
import { BUS_COST, BUS_MASS, BUS_POWER, G0 } from './constants';

export const TEST_KINDS: TestKind[] = ['launch', 'radiation', 'micrometeoroid', 'avionics', 'power', 'thermal', 'propulsion'];

export function componentCards(design: Design, catalog: CardCatalog = defaultCatalog): ComponentCard[] {
  return design.componentIds
    .map((id) => catalog.components.find((c) => c.id === id))
    .filter((c): c is ComponentCard => Boolean(c));
}

export function hasCrew(design: Design, crewId: string): boolean {
  return design.crewIds.includes(crewId);
}

/** Power a card produces at the mission's distance (solar scales with 1/d²). */
export function generationAt(card: ComponentCard, distanceAU: number): number {
  if (card.power <= 0) return 0;
  return card.solar ? card.power / (distanceAU * distanceAU) : card.power;
}

export function downlinkAt(card: ComponentCard, distanceAU: number): number {
  return (card.downlinkAt1AU ?? 0) / (distanceAU * distanceAU);
}

export function deltaVFor(isp: number, wetMass: number, dryMass: number): number {
  if (isp <= 0 || dryMass <= 0 || wetMass <= dryMass) return 0;
  return isp * G0 * Math.log(wetMass / dryMass);
}

export function effectiveBudget(mission: Mission, design: Design): number {
  return mission.budget * (hasCrew(design, 'crew-program') ? 1.1 : 1);
}

export function calculateDesign(mission: Mission, design: Design, catalog: CardCatalog = defaultCatalog): DesignStats {
  const cards = componentCards(design, catalog);
  const launcher = catalog.launchers.find((l) => l.id === design.launcherId);
  const d = mission.distanceAU;
  const massFactor = hasCrew(design, 'crew-systems') ? 0.9 : 1;

  const totalCost = BUS_COST + (launcher?.cost ?? 0) + sum(cards, (c) => c.cost);
  const dryMass = BUS_MASS + sum(cards, (c) => c.mass) * massFactor;
  const propellant = sum(cards, (c) => c.propellant ?? 0);
  const totalMass = dryMass + propellant;
  const engine = cards.find((c) => c.isp);
  const isp = engine?.isp ?? 0;

  const generation = sum(cards, (c) => generationAt(c, d));
  const baseConsumption = BUS_POWER + sum(cards, (c) => (c.category !== 'instrument' && c.power < 0 ? -c.power : 0));
  const instrumentConsumption = sum(cards, (c) => (c.category === 'instrument' && c.power < 0 ? -c.power : 0));
  const cruiseOnly = sum(cards, (c) => -(c.cruiseOnlyPower ?? 0));
  const instruments = cards.filter((c) => c.category === 'instrument');

  const testBonus = Object.fromEntries(TEST_KINDS.map((k) => [k, 0])) as Record<TestKind, number>;
  for (const kind of TEST_KINDS) {
    testBonus[kind] = sum(cards, (c) => (c.testBonus?.[kind] ?? 0) + (c.testBonus?.all ?? 0));
  }
  testBonus.launch += launcher?.reliability ?? 0;
  if (hasCrew(design, 'crew-flight')) {
    testBonus.launch += 2;
    testBonus.propulsion += 2;
  }
  if (hasCrew(design, 'crew-radiation')) testBonus.radiation += 3;
  if (cards.filter((c) => c.category === 'power').length >= 2) testBonus.power += 4;

  return {
    totalCost,
    budget: effectiveBudget(mission, design),
    dryMass,
    propellant,
    totalMass,
    capacity: launcher ? launcher.capacity[mission.launcherKey] : 0,
    isp,
    deltaV: deltaVFor(isp, totalMass, dryMass),
    generation,
    consumptionCruise: baseConsumption + cruiseOnly,
    consumptionOps: baseConsumption + instrumentConsumption,
    batteryW: sum(cards, (c) => c.batteryW ?? 0),
    downlink: sum(cards, (c) => downlinkAt(c, d)) * (hasCrew(design, 'crew-comms') ? 1.2 : 1),
    sciencePerTurn: sum(instruments, (c) => c.science ?? 0) + (hasCrew(design, 'crew-science') ? instruments.length : 0),
    dataPerTurn: sum(instruments, (c) => c.data ?? 0),
    cruiseTurns: mission.cruiseTurns + Math.max(0, ...cards.map((c) => c.extraCruiseTurns ?? 0)),
    testBonus,
  };
}

function sum<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((total, item) => total + fn(item), 0);
}
