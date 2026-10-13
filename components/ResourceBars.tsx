import { fmt } from '@/game/validation';
import type { DesignStats, Mission } from '@/types/game';

interface Bar {
  label: string;
  value: number;
  max: number;
  text: string;
  /** true when the value must stay under max; false when it must reach max. */
  ceiling: boolean;
}

export function ResourceBars({ stats, mission }: { stats: DesignStats; mission: Mission }) {
  const supply = stats.generation + stats.batteryW;
  const bars: Bar[] = [
    { label: 'Orçamento', value: stats.totalCost, max: stats.budget, text: `US$ ${fmt(stats.totalCost)} / ${fmt(stats.budget)} M`, ceiling: true },
    { label: 'Massa', value: stats.totalMass, max: stats.capacity || 1, text: stats.capacity ? `${fmt(stats.totalMass)} / ${fmt(stats.capacity)} kg` : `${fmt(stats.totalMass)} kg · escolha um lançador`, ceiling: true },
    { label: 'Delta-v', value: stats.deltaV, max: mission.requiredDeltaV, text: `${fmt(stats.deltaV)} / ${fmt(mission.requiredDeltaV)} m/s`, ceiling: false },
    { label: 'Energia na operação', value: stats.consumptionOps, max: supply || 1, text: `consome ${fmt(stats.consumptionOps)} W de ${fmt(stats.generation)} W (+${fmt(stats.batteryW)} W bateria)`, ceiling: true },
    { label: 'Downlink', value: stats.dataPerTurn, max: stats.downlink || 0.001, text: `gera ${fmt(stats.dataPerTurn, 1)} Gbit, envia ${fmt(stats.downlink, 1)} Gbit por turno`, ceiling: true },
  ];

  return (
    <div className="space-y-3">
      {bars.map((bar) => {
        const ratio = bar.value / bar.max;
        const ok = bar.ceiling ? ratio <= 1 : ratio >= 1;
        const width = Math.min(100, Math.max(0, ratio * 100));
        return (
          <div key={bar.label}>
            <div className="flex justify-between text-xs">
              <span className="font-medium text-slate-200">{bar.label}</span>
              <span className={ok ? 'text-slate-400' : 'text-rose-400'}>{bar.text}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800" role="meter" aria-label={bar.label} aria-valuenow={bar.value} aria-valuemax={bar.max}>
              <div className={`h-full rounded-full transition-all ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-slate-400">Ciência estimada: {stats.sciencePerTurn} pontos por turno de operação.</p>
    </div>
  );
}
