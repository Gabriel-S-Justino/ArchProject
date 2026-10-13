import { useState, type Dispatch } from 'react';
import { catalog } from '@/game/catalog';
import { canUseAbility, card, liveTestBonus, peekEvent } from '@/game/turn';
import { fmt } from '@/game/validation';
import { ARRIVAL_DIFFICULTY } from '@/game/constants';
import type { GameAction } from '@/hooks/useGame';
import type { GameState } from '@/types/game';
import { EventLog } from './EventLog';
import { CATEGORY_STYLE, PHASE_LABEL, TEST_LABEL } from './ui';

const ARRIVAL_ABILITIES = ['crew-flight'];

export function FlightView({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [actionId, setActionId] = useState<string>();
  const [abilities, setAbilities] = useState<string[]>([]);
  const { mission, ship, stats, phase } = state;
  const arriving = phase === 'arrival';
  const next = peekEvent(state);
  const totalTurns = phase === 'cruise' ? stats.cruiseTurns : mission.operationsTurns;
  const last = state.timeline.at(-1);

  const available = catalog.crew.filter(
    (c) => canUseAbility(state, c.id) && (!arriving || ARRIVAL_ABILITIES.includes(c.id)),
  );

  const toggleAbility = (id: string) =>
    setAbilities((list) => (list.includes(id) ? list.filter((a) => a !== id) : [...list, id]));

  const go = () => {
    dispatch(arriving ? { type: 'ARRIVE', abilities } : { type: 'PLAY_TURN', actionId, abilities });
    setActionId(undefined);
    setAbilities([]);
  };

  const tiles = [
    ['Delta-v restante', `${fmt(ship.deltaV)} m/s`],
    ['Ciência entregue', `${fmt(ship.scienceDelivered)} / ${mission.scienceTarget}`],
    ['Dados a bordo', `${fmt(ship.buffer.data, 1)} Gbit`],
    ['Energia (último turno)', last && last.generation > 0 ? `${fmt(last.consumption)} / ${fmt(last.generation)} W` : '—'],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold text-white">{PHASE_LABEL[phase]}</h2>
            {!arriving && (
              <span className="text-sm text-slate-400">
                Turno {state.phaseTurn + 1} de {totalTurns}
              </span>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-800/70 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="mt-1 font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-orange-400/30 bg-orange-950/30 p-5">
          {arriving ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-300">Manobra crítica</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Inserção orbital</h3>
              <p className="mt-2 text-slate-300">
                A queima gasta {fmt(mission.insertionDeltaV)} m/s e você tem {fmt(ship.deltaV)} m/s. Teste de propulsão: d20 +{' '}
                {liveTestBonus(state, 'propulsion') + state.arrivalBonus} contra {ARRIVAL_DIFFICULTY}. Se falhar, a nave gasta mais propelente e tenta mais uma vez.
              </p>
            </>
          ) : (
            next && (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-orange-300">Próximo evento</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{next.name}</h3>
                <p className="mt-2 text-slate-300">{next.text}</p>
                {next.test && (
                  <p className="mt-2 text-sm text-slate-300">
                    Teste de {TEST_LABEL[next.test]}: d20 + {liveTestBonus(state, next.test)} contra {next.difficulty}.
                    {next.failText && <span className="text-rose-300"> Se falhar: {next.failText}</span>}
                  </p>
                )}
              </>
            )
          )}
        </section>

        {!arriving && (
          <section>
            <h2 className="font-semibold text-white">Cartas de ação</h2>
            <p className="text-sm text-slate-400">Escolha no máximo uma por turno.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {state.hand.map((id, i) => {
                const action = catalog.actions.find((a) => a.id === id)!;
                const selected = actionId === id;
                return (
                  <button
                    key={`${id}-${i}`}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActionId(selected ? undefined : id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      selected ? 'border-cyan-400 bg-cyan-950/50' : 'border-white/10 bg-slate-900 hover:border-white/30'
                    }`}
                  >
                    <h3 className="text-sm font-semibold text-white">{action.name}</h3>
                    <p className="mt-1 text-xs text-slate-300">{action.text}</p>
                  </button>
                );
              })}
              {state.hand.length === 0 && <p className="text-sm text-slate-500">Mão vazia.</p>}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-semibold text-white">Habilidades da equipe</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {available.length === 0 && <p className="text-sm text-slate-500">Nenhuma habilidade disponível nesta fase.</p>}
            {available.map((crew) => {
              const on = abilities.includes(crew.id);
              return (
                <button
                  key={crew.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAbility(crew.id)}
                  title={crew.active ?? ''}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    on ? 'border-cyan-400 bg-cyan-950/50 text-white' : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/30'
                  }`}
                >
                  <span className="font-semibold">{crew.name}</span>
                  <span className="block text-xs text-slate-400">{crew.active}</span>
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={go}
          className="w-full rounded-lg bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-400"
        >
          {arriving ? 'Executar a inserção orbital' : 'Executar turno'}
        </button>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <h2 className="font-semibold text-white">Nave</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {ship.components.map((c) => {
              const info = card(c.id);
              const status = c.damaged ? 'danificado' : c.offUntilTurn !== undefined && c.offUntilTurn >= state.turn ? 'desligado' : c.powerFactor < 1 ? 'degradado' : 'ok';
              return (
                <li key={c.uid} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-200">
                    <span className={`h-2 w-2 rounded-full ${CATEGORY_STYLE[info.category].accent}`} />
                    {info.name}
                  </span>
                  <span className={status === 'ok' ? 'text-slate-500' : 'text-rose-300'}>{status}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <h2 className="font-semibold text-white">Diário de bordo</h2>
          <div className="mt-3">
            <EventLog log={state.log} limit={8} />
          </div>
        </div>
      </aside>
    </div>
  );
}
