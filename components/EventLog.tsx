import type { MissionEvent } from '@/types/game';
import { PHASE_LABEL } from './ui';

export function EventLog({ log, limit }: { log: MissionEvent[]; limit?: number }) {
  const entries = [...log].reverse().slice(0, limit ?? log.length);
  return (
    <ol className="space-y-2" aria-live="polite">
      {entries.map((e, i) => (
        <li key={`${e.turn}-${e.code}-${i}`} className="rounded-lg bg-slate-800/60 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-white">
              {e.title}
              {e.success === true && <span className="ml-2 text-emerald-400">✓</span>}
              {e.success === false && <span className="ml-2 text-rose-400">✕</span>}
            </span>
            <span className="text-xs text-slate-400">
              Turno {e.turn} · {PHASE_LABEL[e.phase]}
            </span>
          </div>
          {e.roll !== undefined && (
            <p className="mt-1 font-mono text-xs text-slate-400">
              d20 = {e.roll} {e.bonus! >= 0 ? '+' : '−'} {Math.abs(e.bonus!)} = {e.total} (precisa de {e.difficulty})
            </p>
          )}
          <p className="mt-1 text-slate-300">{e.explanation}</p>
        </li>
      ))}
    </ol>
  );
}
