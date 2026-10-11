import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney, formatMoneyCompact } from '../../lib/money';
import type { CumulativePoint } from '../../lib/loanStats';
import ChartCard, { DataTable, type LegendItem } from './ChartCard';
import ChartTooltip from './ChartTooltip';

interface Props {
  data: CumulativePoint[];
  currency: string;
  title?: string;
}

const monthLabel = (month: string, language: string) => formatDate(`${month}-01`, language, { month: 'short', year: '2-digit' });

/**
 * Running totals: what the schedule expected to be repaid by each month
 * (dashed) against what actually came in (solid, with a light wash). The gap
 * between them is how far behind — or ahead — the debt is.
 */
const ProgressChart = ({ data, currency, title }: Props) => {
  const { t, language } = useI18n();
  const money = (cents: number) => formatMoney(cents, currency, language);
  // The wash under the paid line gets its own key: two series on one dataKey collide in recharts.
  const rows = data.map((d) => ({ ...d, paidFill: d.paidCents }));
  const legend: LegendItem[] = [
    { label: t('charts.paid'), color: 'var(--series-principal)', line: true },
    { label: t('charts.expected'), color: 'var(--series-interest)', line: true, dashed: true },
  ];

  return (
    <ChartCard
      title={title ?? t('charts.progressTitle')}
      subtitle={t('charts.progressSubtitle', { currency })}
      legend={legend}
      table={
        <DataTable
          head={[t('charts.month'), t('charts.expected'), t('charts.paid')]}
          rows={data.map((d) => [
            monthLabel(d.month, language),
            money(d.expectedCents),
            d.paidCents === null ? '—' : money(d.paidCents),
          ])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => monthLabel(m, language)}
              tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              minTickGap={12}
            />
            <YAxis
              tickFormatter={(v: number) => formatMoneyCompact(v, currency, language)}
              tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ stroke: 'var(--chart-ink-muted)', strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]!.payload as CumulativePoint;
                const gap = point.paidCents === null ? null : point.paidCents - point.expectedCents;
                return (
                  <ChartTooltip
                    title={monthLabel(String(label), language)}
                    rows={[
                      { ...legend[0]!, value: point.paidCents === null ? '—' : money(point.paidCents) },
                      { ...legend[1]!, value: money(point.expectedCents) },
                    ]}
                    footer={
                      gap === null
                        ? undefined
                        : gap < 0
                          ? t('charts.behindBy', { amount: money(-gap) })
                          : t('charts.onTrack')
                    }
                  />
                );
              }}
            />
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="paidFill"
              stroke="none"
              fill="var(--series-principal)"
              fillOpacity={0.1}
              connectNulls={false}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="expectedCents"
              stroke="var(--series-interest)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="paidCents"
              stroke="var(--series-principal)"
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default ProgressChart;
