import { useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { formatMoney, formatPercent } from '../../lib/money';
import { Swatch, type LegendItem } from './ChartCard';

interface Props {
  currency: string;
  principalCollectedCents: number;
  interestCollectedCents: number;
  remainingCents: number;
  /** Larger variant with a headline percentage. */
  large?: boolean;
  /** One "paid" segment instead of principal + interest — the debtor's view, which never shows the lender's earnings. */
  combined?: boolean;
}

/**
 * How much of a debt is settled: one horizontal bar split into principal
 * recovered, interest earned and what's still owed (the unfilled track).
 * Segments are separated by a surface gap; every value is also printed below,
 * so nothing depends on reading the colors.
 */
const BalanceMeter = ({ currency, principalCollectedCents, interestCollectedCents, remainingCents, large, combined }: Props) => {
  const { t, language } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const total = principalCollectedCents + interestCollectedCents + remainingCents;
  const paid = principalCollectedCents + interestCollectedCents;
  const percent = total > 0 ? (paid / total) * 100 : 0;
  const money = (cents: number) => formatMoney(cents, currency, language);

  const segments: (LegendItem & { cents: number })[] = [
    ...(combined
      ? [{ label: t('charts.paid'), color: 'var(--series-principal)', cents: paid }]
      : [
          { label: t('charts.principal'), color: 'var(--series-principal)', cents: principalCollectedCents },
          { label: t('charts.interest'), color: 'var(--series-interest)', cents: interestCollectedCents },
        ]),
    { label: t('charts.remaining'), color: 'var(--series-track)', cents: remainingCents },
  ];

  return (
    <div>
      {large && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatPercent(percent, language)}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {t('charts.paidOf', { paid: money(paid), total: money(total) })}
          </span>
        </div>
      )}

      <div
        className={`flex w-full overflow-hidden rounded-full bg-[var(--series-track)] ${large ? 'h-4' : 'h-2.5'}`}
        role="img"
        aria-label={t('charts.meterLabel', { percent: formatPercent(percent, language), remaining: money(remainingCents) })}
      >
        {segments.map((s, i) =>
          s.cents > 0 && total > 0 ? (
            <div
              key={s.label}
              className="h-full transition-opacity"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                width: `${(s.cents / total) * 100}%`,
                background: s.color,
                // Surface gap between touching segments.
                borderRight: i < segments.length - 1 ? '2px solid var(--chart-surface)' : undefined,
                opacity: hover === null || hover === i ? 1 : 0.55,
              }}
              title={`${s.label}: ${money(s.cents)}`}
            />
          ) : null,
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Swatch item={s} />
            {s.label}
            <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{money(s.cents)}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default BalanceMeter;
