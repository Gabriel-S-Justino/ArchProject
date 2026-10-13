import { describe, expect, it } from 'vitest';
import { G0 } from '@/game/constants';
import { calculateDesign } from '@/game/design';
import { mars, referenceDesign } from './fixtures';

describe('calculateDesign', () => {
  const stats = calculateDesign(mars, referenceDesign);

  it('soma custo com estrutura base e lançador', () => {
    expect(stats.totalCost).toBe(745);
    expect(stats.budget).toBe(800);
  });

  it('calcula massa seca, propelente e capacidade', () => {
    expect(stats.dryMass).toBe(755);
    expect(stats.propellant).toBe(700);
    expect(stats.totalMass).toBe(1455);
    expect(stats.capacity).toBe(4000);
  });

  it('usa a equação do foguete para o delta-v', () => {
    expect(stats.deltaV).toBeCloseTo(320 * G0 * Math.log(1455 / 755), 6);
    expect(stats.deltaV).toBeGreaterThan(mars.requiredDeltaV);
  });

  it('reduz a energia solar com o quadrado da distância', () => {
    expect(stats.generation).toBeCloseTo(2000 / 1.52 ** 2, 6);
  });

  it('reduz o downlink com a distância e aplica a Especialista em Comunicação', () => {
    expect(stats.downlink).toBeCloseTo((30 / 1.52 ** 2) * 1.2, 6);
  });

  it('soma o consumo dos instrumentos só na operação', () => {
    expect(stats.consumptionCruise).toBe(150 + 100 + 40);
    expect(stats.consumptionOps).toBe(150 + 100 + 40 + 80 + 60 + 200 + 10);
  });

  it('soma ciência com o bônus da Cientista-chefe', () => {
    expect(stats.sciencePerTurn).toBe(4 + 5 + 7 + 2 + 4);
    expect(stats.dataPerTurn).toBe(12.5);
  });

  it('aplica bônus de cartas, lançador e equipe nos testes', () => {
    expect(stats.testBonus.launch).toBe(1 + 2 + 2);
    expect(stats.testBonus.radiation).toBe(4 + 1);
    expect(stats.testBonus.propulsion).toBe(1 + 2);
    expect(stats.testBonus.power).toBe(1 + 4);
  });

  it('aplica as passivas de massa e orçamento', () => {
    const s = calculateDesign(mars, { ...referenceDesign, crewIds: ['crew-systems', 'crew-program', 'crew-flight'] });
    expect(s.dryMass).toBeCloseTo(300 + 455 * 0.9, 6);
    expect(s.budget).toBeCloseTo(880, 6);
  });

  it('propulsão iônica alonga o cruzeiro e consome energia nele', () => {
    const ion = { ...referenceDesign, componentIds: referenceDesign.componentIds.map((id) => (id === 'engine-chemical' ? 'engine-ion' : id)) };
    const s = calculateDesign(mars, ion);
    expect(s.cruiseTurns).toBe(6);
    expect(s.consumptionCruise).toBe(150 + 100 + 40 + 500);
  });
});
