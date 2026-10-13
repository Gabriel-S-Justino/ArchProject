import type { ReactNode } from 'react';
import { CATEGORY_STYLE } from './ui';
import type { Category } from '@/types/game';

interface Props {
  category: Category | 'launcher';
  name: string;
  stats: string[];
  flavor?: string;
  badge?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function CardView({ category, name, stats, flavor, badge, selected, disabled, onClick }: Props) {
  const style = CATEGORY_STYLE[category];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`group flex w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 text-left shadow transition hover:-translate-y-0.5 hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${
        selected ? `ring-2 ${style.ring}` : ''
      }`}
    >
      <div className={`flex items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white ${style.accent}`}>
        <span>{style.label}</span>
        {badge}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="text-sm font-semibold text-white">{name}</h3>
        <ul className="space-y-0.5 text-xs text-slate-300">
          {stats.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {flavor && <p className="mt-auto text-[11px] italic leading-snug text-slate-400">{flavor}</p>}
      </div>
    </button>
  );
}
