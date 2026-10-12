import type { Investment } from '../api/investments';
import { todayIso } from './money';

export interface InvestmentValuePoint {
  /** YYYY-MM: the balance at that month's close. */
  month: string;
  /** Money put in minus money taken out, up to that month. */
  investedCents: number;
  /** Interest accumulated on top of it. */
  interestCents: number;
  /** The month hasn't closed yet: what it's expected to be. */
  projected: boolean;
}

const monthOf = (iso: string) => iso.slice(0, 7);

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function lastDay(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/**
 * What the investments of one currency are worth at each month end — split into
 * the money put in and the interest grown on it — from when the first started
 * (at most `pastMonths` back) to `aheadMonths` ahead. An investment counts from
 * its start month until its last statement month (its end date, or the
 * projection's horizon for an open-ended one).
 */
export function investmentValueSeries(investments: Investment[], pastMonths = 36, aheadMonths = 12): InvestmentValuePoint[] {
  if (investments.length === 0) return [];
  const now = monthOf(todayIso());
  const earliest = investments.reduce((min, i) => (monthOf(i.start_on) < min ? monthOf(i.start_on) : min), now);
  const from = earliest > addMonths(now, -pastMonths) ? earliest : addMonths(now, -pastMonths);
  const to = addMonths(now, aheadMonths);

  const points: InvestmentValuePoint[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    let value = 0;
    let invested = 0;
    for (const inv of investments) {
      if (month < monthOf(inv.start_on)) continue;
      // The period closing in this month (one per month; the end month's closes on the end date).
      const period = inv.statement.findLast((p) => monthOf(p.to) === month);
      if (!period) continue;
      value += period.closingCents;
      const end = lastDay(month);
      invested += inv.principal_cents + inv.movements.filter((m) => m.movedOn <= end).reduce((s, m) => s + m.amountCents, 0);
    }
    points.push({ month, investedCents: invested, interestCents: value - invested, projected: month >= now });
  }
  return points;
}
