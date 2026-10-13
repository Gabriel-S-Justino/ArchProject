'use client';

import { Briefing } from '@/components/Briefing';
import { DesignView } from '@/components/DesignView';
import { FlightView } from '@/components/FlightView';
import { MissionReport } from '@/components/MissionReport';
import { PHASE_LABEL } from '@/components/ui';
import { useGame } from '@/hooks/useGame';

const STEPS = ['briefing', 'design', 'cruise', 'arrival', 'operations', 'report'] as const;

export default function Home() {
  const [state, dispatch] = useGame();
  const current = STEPS.indexOf(state.phase === 'launch' ? 'cruise' : (state.phase as (typeof STEPS)[number]));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">NASA Space Apps 2026</p>
        <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">Mission Architect</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Monte uma missão espacial com cartas, administre orçamento, massa, energia e comunicação, e veja como cada escolha decide o destino da nave.
        </p>
        <ol className="mt-5 flex flex-wrap gap-2 text-xs">
          {STEPS.map((step, i) => (
            <li
              key={step}
              className={`rounded-full px-3 py-1 ${
                i === current ? 'bg-orange-500 text-white' : i < current ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {PHASE_LABEL[step]}
            </li>
          ))}
        </ol>
      </header>

      {state.phase === 'briefing' && <Briefing state={state} dispatch={dispatch} />}
      {state.phase === 'design' && <DesignView state={state} dispatch={dispatch} />}
      {(state.phase === 'cruise' || state.phase === 'operations' || state.phase === 'arrival') && (
        <FlightView key={state.phase} state={state} dispatch={dispatch} />
      )}
      {state.phase === 'report' && <MissionReport state={state} dispatch={dispatch} />}
    </main>
  );
}
