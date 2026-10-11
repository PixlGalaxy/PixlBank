import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney, formatMoneyCompact } from '../../lib/money';
import type { MonthlyPoint } from '../../lib/loanStats';
import ChartCard, { DataTable, type LegendItem } from './ChartCard';
import ChartTooltip from './ChartTooltip';

interface Props {
  data: MonthlyPoint[];
  currency: string;
}

const monthLabel = (month: string, language: string) => formatDate(`${month}-01`, language, { month: 'short', year: '2-digit' });

/**
 * Returns per month: each column is what was collected, stacked into the
 * principal it recovered and the interest it earned — the interest segment is
 * the lender's actual profit for that month.
 */
const CollectionsChart = ({ data, currency }: Props) => {
  const { t, language } = useI18n();
  const money = (cents: number) => formatMoney(cents, currency, language);
  const legend: LegendItem[] = [
    { label: t('charts.principal'), color: 'var(--series-principal)' },
    { label: t('charts.interest'), color: 'var(--series-interest)' },
  ];

  return (
    <ChartCard
      title={t('charts.collectionsTitle')}
      subtitle={t('charts.collectionsSubtitle', { currency })}
      legend={legend}
      table={
        <DataTable
          head={[t('charts.month'), t('charts.principal'), t('charts.interest'), t('charts.total')]}
          rows={data.map((d) => [
            monthLabel(d.month, language),
            money(d.principalCents),
            money(d.interestCents),
            money(d.principalCents + d.interestCents),
          ])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => monthLabel(m, language)}
              tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              minTickGap={8}
            />
            <YAxis
              tickFormatter={(v: number) => formatMoneyCompact(v, currency, language)}
              tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ fill: 'var(--chart-grid)', opacity: 0.5 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]!.payload as MonthlyPoint;
                return (
                  <ChartTooltip
                    title={monthLabel(String(label), language)}
                    rows={[
                      { ...legend[0]!, value: money(point.principalCents) },
                      { ...legend[1]!, value: money(point.interestCents) },
                    ]}
                    footer={`${t('charts.total')}: ${money(point.principalCents + point.interestCents)}`}
                  />
                );
              }}
            />
            {/* The 2px surface stroke is the gap between stacked segments. */}
            <Bar
              isAnimationActive={false}
              dataKey="principalCents"
              stackId="a"
              fill="var(--series-principal)"
              stroke="var(--chart-surface)"
              strokeWidth={2}
              maxBarSize={24}
            />
            <Bar
              isAnimationActive={false}
              dataKey="interestCents"
              stackId="a"
              fill="var(--series-interest)"
              stroke="var(--chart-surface)"
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default CollectionsChart;
