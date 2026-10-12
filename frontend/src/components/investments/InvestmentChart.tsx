import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Investment } from '../../api/investments';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney, formatMoneyCompact, todayIso } from '../../lib/money';
import ChartCard, { DataTable, type LegendItem } from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface Point {
  date: string;
  /** Up to today: what it was actually worth. */
  actual: number | null;
  /** From today on: what it's expected to be worth. */
  projected: number | null;
  /** Money put in minus money taken out, so the gap above it is the interest. */
  invested: number;
}

const shortDate = (iso: string, language: string) => formatDate(iso, language, { month: 'short', year: '2-digit' });

/**
 * The expectation chart: the balance month by month — solid up to today, dashed
 * after — over the money actually put in. The widening gap between the two
 * lines is the compounding at work.
 */
const InvestmentChart = ({ investment }: { investment: Investment }) => {
  const { t, language } = useI18n();
  const money = (cents: number) => formatMoney(cents, investment.currency, language);
  const now = todayIso();
  const net = (on: string) =>
    investment.principal_cents + investment.movements.filter((m) => m.movedOn <= on).reduce((s, m) => s + m.amountCents, 0);

  const raw: { date: string; value: number }[] = [
    { date: investment.start_on, value: net(investment.start_on) },
    ...investment.statement.map((p) => ({ date: p.to, value: p.closingCents })),
  ];
  // Today's point joins the solid and the dashed line, so the projection starts where reality is.
  const inRange = now > investment.start_on && now < investment.summary.horizonOn;
  if (inRange && !raw.some((r) => r.date === now)) {
    raw.push({ date: now, value: investment.summary.valueTodayCents });
    raw.sort((a, b) => a.date.localeCompare(b.date));
  }
  const data: Point[] = raw.map((r) => ({
    date: r.date,
    actual: r.date <= now ? r.value : null,
    projected: r.date >= now ? r.value : null,
    invested: net(r.date),
  }));

  const legend: LegendItem[] = [
    { label: t('investments.chartValue'), color: 'var(--series-principal)', line: true },
    { label: t('investments.chartProjected'), color: 'var(--series-principal)', line: true, dashed: true },
    { label: t('investments.chartInvested'), color: 'var(--chart-ink-muted)', line: true },
  ];

  return (
    <ChartCard
      title={t('investments.chartTitle')}
      subtitle={t('investments.chartSubtitle', { date: formatDate(investment.summary.horizonOn, language), currency: investment.currency })}
      legend={legend}
      table={
        <DataTable
          head={[t('investments.date'), t('investments.chartInvested'), t('investments.chartValue')]}
          rows={data.map((p) => [formatDate(p.date, language), money(p.invested), money((p.actual ?? p.projected)!)])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => shortDate(d, language)}
              tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(v: number) => formatMoneyCompact(v, investment.currency, language)}
              tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
              domain={['dataMin', 'auto']}
            />
            {inRange && <ReferenceLine x={now} stroke="var(--chart-ink-muted)" strokeDasharray="2 3" />}
            <Tooltip
              cursor={{ stroke: 'var(--chart-ink-muted)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as Point;
                const value = (p.actual ?? p.projected)!;
                return (
                  <ChartTooltip
                    title={formatDate(p.date, language)}
                    rows={[
                      { ...legend[p.actual === null ? 1 : 0]!, value: money(value) },
                      { ...legend[2]!, value: money(p.invested) },
                    ]}
                    footer={t('investments.chartInterest', { amount: money(value - p.invested) })}
                  />
                );
              }}
            />
            <Area isAnimationActive={false} type="monotone" dataKey="actual" stroke="none" fill="var(--series-principal)" fillOpacity={0.1} />
            <Line
              isAnimationActive={false}
              type="stepAfter"
              dataKey="invested"
              stroke="var(--chart-ink-muted)"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="projected"
              stroke="var(--series-principal)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="actual"
              stroke="var(--series-principal)"
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default InvestmentChart;
