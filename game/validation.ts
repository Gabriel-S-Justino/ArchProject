import type { CardCatalog, Design, Mission, ValidationIssue } from '@/types/game';
import { catalog as defaultCatalog } from './catalog';
import { CREW_SIZE } from './constants';
import { calculateDesign, componentCards } from './design';

const CATEGORY_NAMES: Record<string, string> = {
  power: 'energia',
  comms: 'comunicação',
  propulsion: 'propulsão',
  protection: 'proteção',
  avionics: 'aviônica',
  instrument: 'instrumento',
};

export function validateDesign(mission: Mission, design: Design, catalog: CardCatalog = defaultCatalog): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string) => issues.push({ code, message, severity: 'error' });
  const warning = (code: string, message: string) => issues.push({ code, message, severity: 'warning' });

  const cards = componentCards(design, catalog);
  const stats = calculateDesign(mission, design, catalog);

  if (!catalog.launchers.some((l) => l.id === design.launcherId)) {
    error('no-launcher', 'Escolha um lançador.');
  }
  if (design.crewIds.length !== CREW_SIZE) {
    error('crew-size', `Escolha exatamente ${CREW_SIZE} pessoas para a equipe (você tem ${design.crewIds.length}).`);
  }

  for (const card of catalog.components) {
    const copies = design.componentIds.filter((id) => id === card.id).length;
    const max = card.maxCopies ?? 1;
    if (copies > max) error('too-many-copies', `${card.name}: no máximo ${max} cópia(s).`);
  }

  if (cards.filter((c) => c.isp).length > 1) {
    error('multiple-engines', 'A nave só pode ter um motor principal.');
  }

  for (const category of mission.requires.categories) {
    if (!cards.some((c) => c.category === category)) {
      error('missing-category', `Falta um componente de ${CATEGORY_NAMES[category]}.`);
    }
  }

  const instruments = cards.filter((c) => c.category === 'instrument').length;
  if (instruments < mission.requires.minInstruments) {
    error('min-instruments', `A missão exige pelo menos ${mission.requires.minInstruments} instrumento(s).`);
  }

  if (stats.totalCost > stats.budget) {
    error('over-budget', `Orçamento estourado: US$ ${fmt(stats.totalCost)} M de US$ ${fmt(stats.budget)} M.`);
  }

  if (design.launcherId && stats.totalMass > stats.capacity) {
    error('over-mass', `Massa de ${fmt(stats.totalMass)} kg acima da capacidade do lançador (${fmt(stats.capacity)} kg).`);
  }

  if (stats.deltaV < mission.requiredDeltaV) {
    error(
      'low-deltav',
      `Delta-v de ${fmt(stats.deltaV)} m/s abaixo do exigido (${fmt(mission.requiredDeltaV)} m/s). Mais massa seca reduz o delta-v; mais propelente aumenta.`,
    );
  }

  if (stats.consumptionOps > stats.generation + stats.batteryW) {
    warning(
      'power-ops',
      `Na operação a nave consome ${fmt(stats.consumptionOps)} W, mas gera ${fmt(stats.generation)} W (+${fmt(stats.batteryW)} W de bateria). Instrumentos serão desligados.`,
    );
  }
  if (stats.consumptionCruise > stats.generation + stats.batteryW) {
    warning('power-cruise', `No cruzeiro a nave consome ${fmt(stats.consumptionCruise)} W e gera só ${fmt(stats.generation)} W.`);
  }
  if (stats.dataPerTurn > stats.downlink) {
    warning(
      'downlink',
      `Os instrumentos geram ${fmt(stats.dataPerTurn, 1)} Gbit por turno, mas a antena envia só ${fmt(stats.downlink, 1)} Gbit. Ciência vai ficar presa a bordo.`,
    );
  }

  return issues;
}

export function canLaunch(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === 'error');
}

export function fmt(value: number, digits = 0): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
