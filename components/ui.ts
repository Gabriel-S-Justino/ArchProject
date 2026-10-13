import type { Category, TestKind } from '@/types/game';

export const CATEGORY_STYLE: Record<Category | 'launcher', { label: string; accent: string; ring: string }> = {
  launcher: { label: 'Lançador', accent: 'bg-slate-500', ring: 'ring-slate-400' },
  power: { label: 'Energia', accent: 'bg-amber-500', ring: 'ring-amber-400' },
  comms: { label: 'Comunicação', accent: 'bg-sky-500', ring: 'ring-sky-400' },
  propulsion: { label: 'Propulsão', accent: 'bg-orange-600', ring: 'ring-orange-400' },
  protection: { label: 'Proteção', accent: 'bg-emerald-600', ring: 'ring-emerald-400' },
  avionics: { label: 'Aviônica', accent: 'bg-violet-600', ring: 'ring-violet-400' },
  instrument: { label: 'Instrumento', accent: 'bg-pink-600', ring: 'ring-pink-400' },
};

export const CATEGORY_ORDER: Category[] = ['power', 'comms', 'propulsion', 'protection', 'avionics', 'instrument'];

export const TEST_LABEL: Record<TestKind, string> = {
  launch: 'lançamento',
  radiation: 'radiação',
  micrometeoroid: 'micrometeoroides',
  avionics: 'aviônica',
  power: 'energia',
  thermal: 'térmico',
  propulsion: 'propulsão',
};

export const PHASE_LABEL: Record<string, string> = {
  briefing: 'Briefing',
  design: 'Projeto',
  launch: 'Lançamento',
  cruise: 'Cruzeiro',
  arrival: 'Chegada',
  operations: 'Operações científicas',
  report: 'Relatório',
};
