import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { card } from '../ui/styles';

export interface LegendItem {
  label: string;
  /** CSS color of the mark — the swatch carries identity, the text stays in ink. */
  color: string;
  /** Line-key instead of a square swatch (for line series). */
  line?: boolean;
  dashed?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  /** The same numbers as a table, so nothing is readable only through color or hover. */
  table?: ReactNode;
  children: ReactNode;
}

export const Swatch = ({ item }: { item: LegendItem }) =>
  item.line ? (
    <svg width="16" height="8" aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="15"
        y2="4"
        stroke={item.color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={item.dashed ? '3 3' : undefined}
      />
    </svg>
  ) : (
    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
  );

/** Shared chrome for every chart: title, legend row, and a chart/table toggle. */
const ChartCard = ({ title, subtitle, legend, table, children }: Props) => {
  const { t } = useI18n();
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {showTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
            {showTable ? t('charts.showChart') : t('charts.showTable')}
          </button>
        )}
      </div>

      {legend && legend.length > 1 && !showTable && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Swatch item={item} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4">{showTable ? <div className="max-h-80 overflow-auto">{table}</div> : children}</div>
    </section>
  );
};

export default ChartCard;

/** Minimal data table used by the chart table views. */
export const DataTable = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
  <table className="w-full text-sm">
    <thead className="sticky top-0 bg-white text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
      <tr>
        {head.map((h, i) => (
          <th key={h} className={`px-2 py-1.5 font-medium ${i > 0 ? 'text-right' : ''}`}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, r) => (
        <tr key={r} className="border-t border-slate-100 dark:border-slate-800">
          {row.map((cell, i) => (
            <td
              key={i}
              className={`px-2 py-1.5 tabular-nums text-slate-700 dark:text-slate-200 ${i > 0 ? 'text-right' : ''}`}
            >
              {cell}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);
