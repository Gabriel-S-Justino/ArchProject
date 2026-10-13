import { downlinkAt, generationAt } from '@/game/design';
import { fmt } from '@/game/validation';
import type { ComponentCard, Launcher, Mission } from '@/types/game';
import { TEST_LABEL } from './ui';

export function componentStats(card: ComponentCard, mission: Mission): string[] {
  const lines = [`US$ ${card.cost} M · ${card.mass} kg`];
  if (card.power > 0) {
    lines.push(card.solar ? `+${fmt(generationAt(card, mission.distanceAU))} W no destino (${card.power} W na Terra)` : `+${card.power} W constantes`);
  } else if (card.power < 0) {
    lines.push(`${card.power} W`);
  }
  if (card.batteryW) lines.push(`Cobre até ${card.batteryW} W de déficit`);
  if (card.propellant) lines.push(`${card.propellant} kg de propelente${card.isp ? ` · Isp ${card.isp} s` : ''}`);
  if (card.cruiseOnlyPower) lines.push(`${card.cruiseOnlyPower} W no cruzeiro · +${card.extraCruiseTurns} turnos de viagem`);
  if (card.downlinkAt1AU) lines.push(`Envia ${fmt(downlinkAt(card, mission.distanceAU), 1)} Gbit/turno no destino`);
  if (card.science) lines.push(`+${card.science} ciência · ${fmt(card.data ?? 0, 1)} Gbit por turno`);
  for (const [kind, value] of Object.entries(card.testBonus ?? {})) {
    const label = kind === 'all' ? 'todos os testes' : TEST_LABEL[kind as keyof typeof TEST_LABEL];
    lines.push(`${value > 0 ? '+' : ''}${value} em ${label}`);
  }
  return lines;
}

export function launcherStats(launcher: Launcher, mission: Mission): string[] {
  return [
    `US$ ${launcher.cost} M`,
    `Leva até ${fmt(launcher.capacity[mission.launcherKey])} kg para o destino`,
    `Confiabilidade +${launcher.reliability} no lançamento`,
  ];
}
