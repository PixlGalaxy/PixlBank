import type { LoanDetail } from '../api/loans';
import { todayIso } from './money';

export interface Totals {
  currency: string;
  loans: number;
  activeLoans: number;
  lentCents: number;
  totalDueCents: number;
  expectedInterestCents: number;
  paidCents: number;
  remainingCents: number;
  interestCollectedCents: number;
  principalCollectedCents: number;
  overdueCents: number;
  overdueLoans: number;
  pendingReviewCount: number;
  percentPaid: number;
}

/** Sums loans that share a currency — callers group by currency first (see byCurrency). */
export function totalsFor(currency: string, loans: LoanDetail[]): Totals {
  const counted = loans.filter((l) => l.summary.state !== 'cancelled');
  const sum = (pick: (l: LoanDetail) => number) => counted.reduce((s, l) => s + pick(l), 0);
  const totalDue = sum((l) => l.summary.totalDueCents);
  const paid = sum((l) => l.summary.paidCents);
  return {
    currency,
    loans: loans.length,
    activeLoans: counted.filter((l) => l.summary.state === 'active' || l.summary.state === 'overdue').length,
    lentCents: sum((l) => l.principal_cents),
    totalDueCents: totalDue,
    expectedInterestCents: sum((l) => l.summary.totalInterestCents),
    paidCents: paid,
    remainingCents: sum((l) => l.summary.remainingCents),
    interestCollectedCents: sum((l) => l.summary.interestCollectedCents),
    principalCollectedCents: sum((l) => l.summary.principalCollectedCents),
    overdueCents: sum((l) => l.summary.overdueCents),
    overdueLoans: counted.filter((l) => l.summary.state === 'overdue').length,
    pendingReviewCount: loans.reduce((s, l) => s + l.summary.pendingReviewCount, 0),
    percentPaid: totalDue > 0 ? (paid / totalDue) * 100 : 0,
  };
}

const monthOf = (iso: string) => iso.slice(0, 7);

function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

export interface MonthlyPoint {
  month: string;
  principalCents: number;
  interestCents: number;
}

/** Approved collections per calendar month, split into the principal and interest they paid off. */
export function monthlyCollections(loans: LoanDetail[], maxMonths = 12): MonthlyPoint[] {
  const payments = loans.flatMap((l) => l.payments.filter((p) => p.status === 'approved'));
  const now = monthOf(todayIso());
  const earliest = loans.reduce((min, l) => (monthOf(l.disbursed_on) < min ? monthOf(l.disbursed_on) : min), now);
  let months = monthRange(earliest, now);
  if (months.length > maxMonths) months = months.slice(-maxMonths);

  const byMonth = new Map(months.map((m) => [m, { month: m, principalCents: 0, interestCents: 0 }]));
  for (const p of payments) {
    const point = byMonth.get(monthOf(p.paid_on));
    if (!point) continue;
    point.principalCents += p.principal_cents;
    point.interestCents += p.interest_cents;
  }
  return months.map((m) => byMonth.get(m)!);
}

export interface CumulativePoint {
  month: string;
  /** What the schedule says should have been paid by the end of this month. */
  expectedCents: number;
  /** What actually was (null for months still in the future). */
  paidCents: number | null;
}

/** Expected-vs-paid running totals from the first disbursement to the last due date. */
export function cumulativeProgress(loans: LoanDetail[]): CumulativePoint[] {
  const counted = loans.filter((l) => l.summary.state !== 'cancelled');
  if (counted.length === 0) return [];
  const installments = counted.flatMap((l) => l.installments);
  const payments = counted.flatMap((l) => l.payments.filter((p) => p.status === 'approved'));
  const now = monthOf(todayIso());

  const start = counted.reduce((min, l) => (monthOf(l.disbursed_on) < min ? monthOf(l.disbursed_on) : min), now);
  const lastDue = installments.reduce((max, i) => (monthOf(i.due_on) > max ? monthOf(i.due_on) : max), now);
  const months = monthRange(start, lastDue);

  let expected = 0;
  let paid = 0;
  return months.map((month) => {
    expected += installments.filter((i) => monthOf(i.due_on) === month).reduce((s, i) => s + i.amount_cents, 0);
    paid += payments.filter((p) => monthOf(p.paid_on) === month).reduce((s, p) => s + p.amount_cents, 0);
    return { month, expectedCents: expected, paidCents: month <= now ? paid : null };
  });
}
