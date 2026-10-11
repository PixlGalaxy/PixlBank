import type { LucideIcon } from 'lucide-react';
import { card } from '../ui/styles';

interface Props {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon chip. Status tiles pair the color with the icon, never color alone. */
  tone?: string;
}

const StatTile = ({ label, value, hint, icon: Icon, tone = 'bg-[var(--accent-50)] text-[var(--accent-600)] dark:bg-[var(--accent-500)]/15 dark:text-[var(--accent-300)]' }: Props) => (
  <div className={`${card} flex items-start gap-3 p-4`}>
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <Icon size={20} />
    </span>
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  </div>
);

export default StatTile;
