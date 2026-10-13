import { describe, expect, it } from 'vitest';
import { canLaunch, validateDesign } from '@/game/validation';
import type { Design } from '@/types/game';
import { mars, referenceDesign, withSwap } from './fixtures';

const codes = (design: Design) => validateDesign(mars, design).map((i) => i.code);

describe('validateDesign', () => {
  it('aceita a nave de referência', () => {
    const issues = validateDesign(mars, referenceDesign);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(canLaunch(issues)).toBe(true);
  });

  it('exige lançador', () => {
    expect(codes({ ...referenceDesign, launcherId: undefined })).toContain('no-launcher');
  });

  it('exige equipe de 3', () => {
    expect(codes({ ...referenceDesign, crewIds: ['crew-science'] })).toContain('crew-size');
  });

  it('limita cópias', () => {
    expect(codes({ ...referenceDesign, componentIds: [...referenceDesign.componentIds, 'camera-hires'] })).toContain('too-many-copies');
  });

  it('permite só um motor', () => {
    expect(codes({ ...referenceDesign, componentIds: [...referenceDesign.componentIds, 'engine-ion'] })).toContain('multiple-engines');
  });

  it('exige as categorias da missão', () => {
    const noComms = { ...referenceDesign, componentIds: referenceDesign.componentIds.filter((id) => id !== 'antenna-high') };
    expect(codes(noComms)).toContain('missing-category');
  });

  it('exige instrumentos', () => {
    const none = { ...referenceDesign, componentIds: referenceDesign.componentIds.filter((id) => !['camera-hires', 'spectrometer', 'radar-sounder', 'magnetometer'].includes(id)) };
    expect(codes(none)).toContain('min-instruments');
  });

  it('bloqueia orçamento estourado', () => {
    expect(codes({ ...referenceDesign, launcherId: 'launcher-heavy' })).toContain('over-budget');
  });

  it('bloqueia massa acima da capacidade', () => {
    expect(codes({ ...referenceDesign, launcherId: 'launcher-light' })).toContain('over-mass');
  });

  it('bloqueia delta-v insuficiente', () => {
    expect(codes({ ...referenceDesign, componentIds: [...referenceDesign.componentIds, 'ir-thermometer', 'thermal-control'] })).toContain('low-deltav');
  });

  it('avisa sobre energia e downlink sem bloquear', () => {
    const weak = withSwap(withSwap(referenceDesign, 'solar-large', 'solar-small'), 'antenna-high', 'antenna-low');
    const issues = validateDesign(mars, weak);
    expect(issues.find((i) => i.code === 'power-ops')?.severity).toBe('warning');
    expect(issues.find((i) => i.code === 'downlink')?.severity).toBe('warning');
  });

  it('com todas as cartas falha por orçamento', () => {
    const all = { ...referenceDesign, componentIds: ['engine-chemical', 'solar-small', 'solar-large', 'rtg', 'battery', 'antenna-low', 'antenna-high', 'laser-optical', 'tank-extra', 'shield-radiation', 'shield-micrometeoroid', 'thermal-control', 'computer-basic', 'computer-redundant', 'camera-hires', 'spectrometer', 'radar-sounder', 'magnetometer', 'ir-thermometer'] };
    const c = codes(all);
    expect(c).toContain('over-budget');
  });
});
