import type { Dispatch } from 'react';
import { fmt } from '@/game/validation';
import type { GameAction } from '@/hooks/useGame';
import type { GameState } from '@/types/game';
import { EventLog } from './EventLog';
import { PHASE_LABEL } from './ui';

const OUTCOME = {
  success: { title: 'Missão cumprida', tone: 'border-emerald-400/40 bg-emerald-950/40 text-emerald-300' },
  partial: { title: 'Sucesso parcial', tone: 'border-amber-400/40 bg-amber-950/40 text-amber-300' },
  failure: { title: 'Missão perdida', tone: 'border-rose-400/40 bg-rose-950/40 text-rose-300' },
};

export function MissionReport({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const result = state.result!;
  const outcome = OUTCOME[result.outcome];

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-6 ${outcome.tone}`}>
        <p className="text-xs font-semibold uppercase tracking-widest">Relatório da missão {state.mission.name}</p>
        <h2 className="mt-1 text-3xl font-bold text-white">{outcome.title}</h2>
        <p className="mt-2 text-2xl" aria-label={`${result.stars} de 3 estrelas`}>
          {'★'.repeat(result.stars)}
          <span className="text-slate-600">{'★'.repeat(3 - result.stars)}</span>
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fact label="Pontuação" value={fmt(result.score)} />
          <Fact label="Ciência entregue" value={`${fmt(result.scienceDelivered)} / ${state.mission.scienceTarget}`} />
          <Fact label="Orçamento sobrando" value={`US$ ${fmt(result.budgetLeft)} M`} />
        </dl>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">O que aprendemos</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
          {result.lessons.map((lesson) => (
            <li key={lesson}>{lesson}</li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">Linha do tempo</h2>
        <table className="mt-3 w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="py-1 pr-3">Turno</th>
              <th className="py-1 pr-3">Fase</th>
              <th className="py-1 pr-3">Geração (W)</th>
              <th className="py-1 pr-3">Consumo (W)</th>
              <th className="py-1 pr-3">Downlink (Gbit)</th>
              <th className="py-1 pr-3">Ciência</th>
              <th className="py-1 pr-3">Delta-v (m/s)</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {result.timeline.map((t, i) => (
              <tr key={`${t.turn}-${i}`} className="border-t border-white/5">
                <td className="py-1 pr-3">{t.turn}</td>
                <td className="py-1 pr-3">{PHASE_LABEL[t.phase]}</td>
                <td className="py-1 pr-3">{t.generation ? fmt(t.generation) : '—'}</td>
                <td className="py-1 pr-3">{t.consumption ? fmt(t.consumption) : '—'}</td>
                <td className="py-1 pr-3">{fmt(t.downlink, 1)}</td>
                <td className="py-1 pr-3">{fmt(t.scienceDelivered)}</td>
                <td className="py-1 pr-3">{fmt(t.deltaV)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <details className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
        <summary className="cursor-pointer font-semibold text-white">Diário de bordo completo</summary>
        <div className="mt-3">
          <EventLog log={result.log} />
        </div>
      </details>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'RESTART' })}
          className="rounded-lg border border-white/20 px-4 py-2 text-slate-200 hover:bg-white/5"
        >
          Nova equipe
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'RETRY', sameSeed: false })}
          className="rounded-lg border border-white/20 px-4 py-2 text-slate-200 hover:bg-white/5"
        >
          Mesma nave, nova sorte
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'RETRY', sameSeed: true })}
          className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-400"
          title="Os mesmos eventos vão acontecer nos mesmos turnos. Mude uma carta e compare."
        >
          Ajustar a nave e repetir os mesmos eventos
        </button>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/60 p-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-white">{value}</dd>
    </div>
  );
}
