import type { GameState, Outcome } from '@/types/game';
import { componentCards } from './design';
import { fmt } from './validation';

/** Plain-language explanations of why the mission went the way it did. */
export function buildLessons(state: GameState, outcome: Outcome): string[] {
  const lessons: string[] = [];
  const { mission, stats, ship, log } = state;
  const cards = componentCards(state.design);
  const has = (code: string, success?: boolean) =>
    log.some((e) => e.code === code && (success === undefined || e.success === success));
  const d = mission.distanceAU;

  if (has('launch-lost')) {
    lessons.push('O lançador falhou e a missão acabou antes de começar. Lançadores mais confiáveis e o Controlador de Voo aumentam a chance de sucesso.');
  }

  if (d > 1 && cards.some((c) => c.solar)) {
    lessons.push(
      `Na missão ${mission.name}, a ${fmt(d, 2)} UA do Sol, cada painel solar rende só ${fmt(100 / (d * d))}% do que renderia perto da Terra: a luz do Sol cai com o quadrado da distância.`,
    );
  }

  if (stats.dataPerTurn > stats.downlink) {
    lessons.push(
      `Seus instrumentos geravam ${fmt(stats.dataPerTurn, 1)} Gbit por turno, mas a antena só enviava ${fmt(stats.downlink, 1)} Gbit. Ciência só conta quando chega à Terra.`,
    );
  }
  if (ship.dataLost > 0) {
    lessons.push(`A memória de bordo encheu e ${fmt(ship.dataLost, 1)} Gbit foram descartados. Uma antena melhor esvaziaria a memória a tempo.`);
  }

  if (has('power-shed') || has('power-safe-mode')) {
    lessons.push('Faltou energia e partes da nave foram desligadas. Mais painéis, um RTG ou uma bateria resolveriam, mas custam massa e orçamento.');
  }
  if (has('no-avionics')) {
    lessons.push('O único computador de bordo foi danificado. Redundância pesa e custa, mas evita que uma única falha encerre a missão.');
  }
  if (has('event-solar-storm', false) && !cards.some((c) => c.testBonus?.radiation)) {
    lessons.push('A tempestade solar derrubou a energia. Uma blindagem de radiação ou a Especialista em Radiação teriam ajudado.');
  }
  if (has('event-micrometeoroid', false) && !cards.some((c) => c.testBonus?.micrometeoroid)) {
    lessons.push('Um micrometeoroide danificou a nave. Um escudo de micrometeoroides é peso "morto" que salva missões.');
  }

  if (has('arrival-no-deltav')) {
    lessons.push(
      'Faltou propelente para frear no destino. Pela equação do foguete, cada quilo a mais de massa seca reduz o delta-v; um tanque extra ou menos carga resolveria.',
    );
  } else if (has('arrival-lost')) {
    lessons.push('A inserção orbital falhou duas vezes. Correções de trajetória e o Controlador de Voo deixam essa manobra mais segura.');
  }

  if (outcome === 'success') {
    const share = stats.budget > 0 ? (stats.budget - stats.totalCost) / stats.budget : 0;
    lessons.push(
      share >= 0.2
        ? `Missão cumprida com ${fmt(share * 100)}% do orçamento sobrando: engenharia eficiente.`
        : 'Missão cumprida! Tente de novo gastando menos para ganhar a terceira estrela.',
    );
  } else if (outcome === 'partial' && ship.alive) {
    lessons.push(`A nave sobreviveu, mas entregou ${fmt(ship.scienceDelivered)} de ${mission.scienceTarget} pontos de ciência.`);
  }

  return [...new Set(lessons)];
}
