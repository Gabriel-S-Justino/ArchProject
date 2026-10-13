import type { Dispatch } from 'react';
import { catalog } from '@/game/catalog';
import { canLaunch, validateDesign } from '@/game/validation';
import { newSeed, type GameAction } from '@/hooks/useGame';
import type { GameState } from '@/types/game';
import { CardView } from './CardView';
import { componentStats, launcherStats } from './cardStats';
import { ResourceBars } from './ResourceBars';
import { CATEGORY_ORDER, CATEGORY_STYLE } from './ui';

export function DesignView({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const { mission, design, stats } = state;
  const issues = validateDesign(mission, design);
  const ready = canLaunch(issues);
  const copies = (id: string) => design.componentIds.filter((c) => c === id).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-white">Lançador</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {catalog.launchers.map((l) => (
              <CardView
                key={l.id}
                category="launcher"
                name={l.name}
                stats={launcherStats(l, mission)}
                flavor={l.flavor}
                selected={design.launcherId === l.id}
                onClick={() => dispatch({ type: 'SELECT_LAUNCHER', launcherId: l.id })}
              />
            ))}
          </div>
        </section>

        {CATEGORY_ORDER.map((category) => (
          <section key={category}>
            <h2 className="text-lg font-semibold text-white">{CATEGORY_STYLE[category].label}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.components
                .filter((c) => c.category === category)
                .map((c) => {
                  const n = copies(c.id);
                  const max = c.maxCopies ?? 1;
                  return (
                    <CardView
                      key={c.id}
                      category={c.category}
                      name={c.name}
                      stats={componentStats(c, mission)}
                      flavor={c.flavor}
                      selected={n > 0}
                      badge={n > 0 ? <span>{max > 1 ? `${n}/${max}` : 'na nave'}</span> : undefined}
                      onClick={() =>
                        dispatch(n >= max ? { type: 'REMOVE_COMPONENT', componentId: c.id } : { type: 'ADD_COMPONENT', componentId: c.id })
                      }
                    />
                  );
                })}
            </div>
          </section>
        ))}
        <p className="text-xs text-slate-500">
          Clique numa carta para colocar na nave; clique de novo para tirar. Os números são de balanceamento do jogo, inspirados em ordens de grandeza reais.
        </p>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <h2 className="font-semibold text-white">Recursos da nave</h2>
          <div className="mt-3">
            <ResourceBars stats={stats} mission={mission} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <h2 className="font-semibold text-white">Checklist de lançamento</h2>
          {issues.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-400">Tudo certo para lançar.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm" aria-live="polite">
              {issues.map((issue, i) => (
                <li key={`${issue.code}-${i}`} className={issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}>
                  {issue.severity === 'error' ? '✕' : '!'} {issue.message}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'BACK_TO_BRIEFING' })}
              className="rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => dispatch({ type: 'LAUNCH', seed: newSeed() })}
              className="flex-1 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Lançar missão
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
