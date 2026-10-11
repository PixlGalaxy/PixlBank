import type { LegendItem } from './ChartCard';
import { Swatch } from './ChartCard';

interface Row extends LegendItem {
  value: string;
}

/** Hover card shared by all charts: a title and one row per series, ink-colored text beside a colored key. */
const ChartTooltip = ({ title, rows, footer }: { title: string; rows: Row[]; footer?: string }) => (
  <div className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
    <p className="mb-1.5 font-semibold text-slate-900 dark:text-slate-100">{title}</p>
    {rows.map((row) => (
      <div key={row.label} className="flex items-center justify-between gap-4 py-0.5">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <Swatch item={row} />
          {row.label}
        </span>
        <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{row.value}</span>
      </div>
    ))}
    {footer && (
      <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-slate-500 dark:border-slate-700 dark:text-slate-400">{footer}</p>
    )}
  </div>
);

export default ChartTooltip;
