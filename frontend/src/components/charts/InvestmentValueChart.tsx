import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney, formatMoneyCompact, todayIso } from '../../lib/money';
import type { InvestmentValuePoint } from '../../lib/investmentStats';
import ChartCard, { DataTable, type LegendItem } from './ChartCard';
import ChartTooltip from './ChartTooltip';

const monthLabel = (month: string, language: string) => formatDate(`${month}-01`, language, { month: 'short', year: '2-digit' });

interface Row extends InvestmentValuePoint {
  // Up to the last closed month, and from it on: the two halves overlap on that month so the shape is continuous.
  investedActual: number | null;
  interestActual: number | null;
  investedProjected: number | null;
  interestProjected: number | null;
}

/**
 * What the investments are worth, month end by month end: the money put in at
 * the bottom, the interest grown on it stacked above — the total height is the
 * value. Past months are solid; the months ahead fade into a dashed
 * expectation, so the compounding shows as the top band widening.
 */
const InvestmentValueChart = ({ data, currency }: { data: InvestmentValuePoint[]; currency: string }) => {
  const { t, language } = useI18n();
  const money = (cents: number) => formatMoney(cents, currency, language);
  const now = todayIso().slice(0, 7);
  const lastClosed = [...data].reverse().find((d) => !d.projected)?.month ?? null;

  const rows: Row[] = data.map((d) => {
    const actual = !d.projected;
    const projected = d.projected || d.month === lastClosed;
    return {
      ...d,
      investedActual: actual ? d.investedCents : null,
      interestActual: actual ? d.interestCents : null,
      investedProjected: projected ? d.investedCents : null,
      interestProjected: projected ? d.interestCents : null,
    };
  });

  const legend: LegendItem[] = [
    { label: t('charts.investedPart'), color: 'var(--series-principal)' },
    { label: t('charts.interestPart'), color: 'var(--series-investment)' },
    { label: t('charts.expected'), color: 'var(--chart-ink-muted)', line: true, dashed: true },
  ];

  return (
    <ChartCard
      title={t('charts.investmentValueTitle')}
      subtitle={t('charts.investmentValueSubtitle', { currency })}
      legend={legend}
      table={
        <DataTable
          head={[t('charts.month'), legend[0]!.label, legend[1]!.label, t('charts.investmentValue')]}
          rows={data.map((d) => [
            `${monthLabel(d.month, language)}${d.projected ? ` (${t('charts.expected').toLowerCase()})` : ''}`,
            money(d.investedCents),
            money(d.interestCents),
            money(d.investedCents + d.interestCents),
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
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(v: number) => formatMoneyCompact(v, currency, language)}
              tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            {data.some((d) => d.month === now) && <ReferenceLine x={now} stroke="var(--chart-ink-muted)" strokeDasharray="2 3" />}
            <Tooltip
              cursor={{ stroke: 'var(--chart-ink-muted)', strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]!.payload as Row;
                return (
                  <ChartTooltip
                    title={`${monthLabel(String(label), language)}${point.projected ? ` · ${t('charts.expected')}` : ''}`}
                    rows={[
                      { ...legend[0]!, value: money(point.investedCents) },
                      { ...legend[1]!, value: money(point.interestCents) },
                    ]}
                    footer={`${t('charts.investmentValue')}: ${money(point.investedCents + point.interestCents)}`}
                  />
                );
              }}
            />
            {/* Solid: what the months that closed were actually worth. */}
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="investedActual"
              stackId="actual"
              stroke="var(--series-principal)"
              strokeWidth={2}
              fill="var(--series-principal)"
              fillOpacity={0.25}
            />
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="interestActual"
              stackId="actual"
              stroke="var(--series-investment)"
              strokeWidth={2}
              fill="var(--series-investment)"
              fillOpacity={0.35}
            />
            {/* Faded and dashed: what's expected from here on. */}
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="investedProjected"
              stackId="projected"
              stroke="var(--series-principal)"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="var(--series-principal)"
              fillOpacity={0.1}
            />
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="interestProjected"
              stackId="projected"
              stroke="var(--series-investment)"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="var(--series-investment)"
              fillOpacity={0.15}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default InvestmentValueChart;
