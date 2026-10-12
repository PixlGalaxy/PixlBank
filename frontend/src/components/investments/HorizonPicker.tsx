import { CalendarOff } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { todayIso } from '../../lib/money';
import { input, label } from '../ui/styles';

/** How far ahead a projection can reach (the server caps it too). */
const MAX_YEARS = 50;
const PRESET_YEARS = [1, 5, 10, 20];

function plusYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  // 29 Feb + 1 year lands on 1 Mar rather than an invalid date.
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

interface Props {
  id: string;
  startOn: string;
  endOn: string | null;
  /** The date the numbers currently run to. */
  value: string;
  /** '' goes back to the default (the end date, or a couple of years ahead). */
  onChange: (iso: string) => void;
  /** Project as if the investment carried on past its end date. */
  ignoreEnd: boolean;
  onIgnoreEndChange: (ignore: boolean) => void;
}

/** "How much will it be worth on…": a date, quick presets, and — for one with an end date — "what if it carried on". */
const HorizonPicker = ({ id, startOn, endOn, value, onChange, ignoreEnd, onIgnoreEndChange }: Props) => {
  const { t } = useI18n();
  const today = todayIso();
  const base = today > startOn ? today : startOn;
  const latest = plusYears(base, MAX_YEARS);
  const limit = endOn && !ignoreEnd ? endOn : latest;
  const presets = PRESET_YEARS.map((n) => ({ n, iso: plusYears(base, n) })).filter((p) => p.iso <= limit);

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition ${
      active
        ? 'border-[var(--accent-500)] bg-[var(--accent-50)] text-[var(--accent-700)] dark:bg-[var(--accent-500)]/15 dark:text-[var(--accent-300)]'
        : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
    }`;

  return (
    <div>
      <label className={label} htmlFor={`horizon-${id}`}>
        {t('investments.howMuchOn')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`horizon-${id}`}
          type="date"
          value={value}
          min={startOn}
          max={limit}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className={`${input} w-44`}
        />
        {presets.map((p) => (
          <button key={p.n} type="button" onClick={() => onChange(p.iso)} className={chip(value === p.iso)}>
            {p.n === 1 ? t('investments.inOneYear') : t('investments.inYears', { count: p.n })}
          </button>
        ))}
        {endOn && !ignoreEnd && (
          <button type="button" onClick={() => onChange('')} className={chip(value === endOn)}>
            {t('investments.atEnd')}
          </button>
        )}
        {endOn && (
          <button
            type="button"
            onClick={() => onIgnoreEndChange(!ignoreEnd)}
            className={chip(ignoreEnd)}
            aria-pressed={ignoreEnd}
            title={t('investments.ignoreEndHint')}
          >
            <CalendarOff size={14} /> {t('investments.ignoreEnd')}
          </button>
        )}
      </div>
      {ignoreEnd && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t('investments.ignoreEndHint')}</p>}
    </div>
  );
};

export default HorizonPicker;
