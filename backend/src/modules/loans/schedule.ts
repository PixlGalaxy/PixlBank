import type { InterestMethod, PaymentFrequency, RatePeriod } from '../../types/index.js';

export interface ScheduleTerms {
  principalCents: number;
  /** Percentage, e.g. 24 for 24%. */
  interestRate: number;
  ratePeriod: RatePeriod;
  interestMethod: InterestMethod;
  frequency: PaymentFrequency;
  installmentsCount: number;
  /** YYYY-MM-DD */
  firstDueOn: string;
}

export interface ScheduledInstallment {
  number: number;
  dueOn: string;
  amountCents: number;
  principalCents: number;
  interestCents: number;
}

const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = { weekly: 52, biweekly: 26, monthly: 12 };

/**
 * Interest rate for one installment period, as a fraction. A monthly rate is
 * first annualized (×12) and then split across the installment frequency, so
 * 2% monthly with weekly installments is 2·12/52 ≈ 0.46% per week.
 */
export function periodRate(interestRate: number, ratePeriod: RatePeriod, frequency: PaymentFrequency): number {
  const annual = ratePeriod === 'annual' ? interestRate / 100 : (interestRate / 100) * 12;
  return annual / PERIODS_PER_YEAR[frequency];
}

function parseDate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Due date of installment `index` (0-based). Monthly dates keep the day-of-month, clamped to short months. */
export function dueDate(firstDueOn: string, frequency: PaymentFrequency, index: number): string {
  const { y, m, d } = parseDate(firstDueOn);
  if (frequency === 'monthly') {
    const monthIndex = m - 1 + index;
    const year = y + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return format(year, month, Math.min(d, lastDay));
  }
  const days = (frequency === 'weekly' ? 7 : 14) * index;
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return format(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export interface AmortizedRow {
  principalCents: number;
  interestCents: number;
}

/**
 * Splits `principalCents` into `n` installments at period rate `r`. All math is
 * done in integer cents; rounding leftovers are absorbed by the last
 * installment so the totals add up exactly.
 *
 * - french: fixed installment P·r / (1 − (1+r)^−n); each one's interest is
 *   charged on the outstanding balance, so interest shrinks over time.
 * - simple: total interest P·r·n spread evenly; every installment is identical.
 */
export function amortize(principalCents: number, r: number, n: number, method: InterestMethod): AmortizedRow[] {
  const P = principalCents;
  const rows: AmortizedRow[] = [];

  if (method === 'simple') {
    const totalInterest = Math.round(P * r * n);
    const principalEach = Math.floor(P / n);
    const interestEach = Math.floor(totalInterest / n);
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      rows.push({
        principalCents: last ? P - principalEach * (n - 1) : principalEach,
        interestCents: last ? totalInterest - interestEach * (n - 1) : interestEach,
      });
    }
    return rows;
  }

  const payment = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
  let balance = P;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const interestCents = Math.round(balance * r);
    const principalCents = last ? balance : Math.min(balance, Math.round(payment) - interestCents);
    balance -= principalCents;
    rows.push({ principalCents, interestCents });
  }
  return rows;
}

/** Builds the original installment table for a loan's terms (see `amortize`). */
export function buildSchedule(terms: ScheduleTerms): ScheduledInstallment[] {
  const r = periodRate(terms.interestRate, terms.ratePeriod, terms.frequency);
  return amortize(terms.principalCents, r, terms.installmentsCount, terms.interestMethod).map((row, i) => ({
    number: i + 1,
    dueOn: dueDate(terms.firstDueOn, terms.frequency, i),
    amountCents: row.principalCents + row.interestCents,
    principalCents: row.principalCents,
    interestCents: row.interestCents,
  }));
}
