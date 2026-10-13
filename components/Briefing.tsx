import type { Dispatch } from 'react';
import { catalog } from '@/game/catalog';
import { CREW_SIZE } from '@/game/constants';
import { fmt } from '@/game/validation';
import type { GameAction } from '@/hooks/useGame';
import type { GameState } from '@/types/game';

export function Briefing({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const { mission, design } = state;
  const facts = [
    ['Distância do Sol', `${fmt(mission.distanceAU, 2)} UA`],
    ['Orçamento', `US$ ${fmt(mission.budget)} M`],
    ['Delta-v exigido', `${fmt(mission.requiredDeltaV)} m/s`],
    ['Cruzeiro / operação', `${mission.cruiseTurns} / ${mission.operationsTurns} turnos`],
    ['Meta de ciência', `${mission.scienceTarget} pontos`],
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-400">Carta de missão</p>
        <h2 className="mt-1 text-2xl font-bold text-white">{mission.name}</h2>
        <p className="mt-3 max-w-2xl text-slate-300">{mission.briefing}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-800/70 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="mt-1 font-semibold text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Monte a equipe</h2>
            <p className="text-sm text-slate-400">
              Escolha {CREW_SIZE} pessoas. Cada uma tem uma habilidade passiva e uma ativa (uma vez por fase).
            </p>
          </div>
          <span className="text-sm text-slate-300">
            {design.crewIds.length}/{CREW_SIZE}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.crew.map((crew) => {
            const selected = design.crewIds.includes(crew.id);
            const full = !selected && design.crewIds.length >= CREW_SIZE;
            return (
              <button
                key={crew.id}
                type="button"
                aria-pressed={selected}
                disabled={full}
                onClick={() => dispatch({ type: 'TOGGLE_CREW', crewId: crew.id })}
                className={`rounded-xl border p-4 text-left transition disabled:opacity-40 ${
                  selected ? 'border-cyan-400 bg-cyan-950/50' : 'border-white/10 bg-slate-900 hover:border-white/30'
                }`}
              >
                <h3 className="font-semibold text-white">{crew.name}</h3>
                <p className="mt-2 text-sm text-slate-300">
                  <span className="text-slate-400">Passiva:</span> {crew.passive}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  <span className="text-slate-400">Ativa:</span> {crew.active ?? '—'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={design.crewIds.length !== CREW_SIZE}
          onClick={() => dispatch({ type: 'BEGIN_DESIGN' })}
          className="rounded-lg bg-orange-500 px-5 py-2.5 font-semibold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Projetar a nave
        </button>
      </div>
    </div>
  );
}
