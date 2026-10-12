import type { RatePeriod } from '../../types/index.js';
import { addDays } from '../loans/dates.js';

/** From when a contribution or withdrawal starts (or stops) earning interest. */
export type AccrualStart = 'same_day' | 'month_end';

export interface InvestmentMovement {
  id: string;
  /** YYYY-MM-DD */
  movedOn: string;
  /** Positive: money added. Negative: money taken out. */
  amountCents: number;
  accrual: AccrualStart;
  note: string | null;
}

export interface InvestmentTerms {
  principalCents: number;
  /** Percentage, effective: 5 means 5% a year (or a month), compounded. */
  interestRate: number;
  ratePeriod: RatePeriod;
  /** YYYY-MM-DD */
  startOn: string;
  /** YYYY-MM-DD, or null for an open-ended investment. */
  endOn: string | null;
}

export interface InvestmentPeriod {
  /** The period runs from the day after `from` up to and including `to` — as in a bank statement. */
  from: string;
  to: string;
  days: number;
  openingCents: number;
  interestCents: number;
  /** Net contributions minus withdrawals booked in this period. */
  movementCents: number;
  closingCents: number;
  /** Ends after today: an expectation, not yet earned. */
  projected: boolean;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

function monthEnd(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/**
 * Effective rate for a stretch of `days`, the way Peruvian banks quote it: an
 * effective annual rate (TEA) over a 360-day year — so 5% a year earns
 * (1.05^(days/360) − 1). A monthly rate is effective over 30 days.
 */
export function growth(terms: Pick<InvestmentTerms, 'interestRate' | 'ratePeriod'>, days: number): number {
  const base = terms.ratePeriod === 'monthly' ? 30 : 360;
  return Math.pow(1 + terms.interestRate / 100, days / base) - 1;
}

/**
 * The month-by-month statement of a compounding investment: interest is
 * credited to the balance at every month end (and on the end date), so it
 * earns interest itself from then on. A movement booked "same day" earns (or,
 * if a withdrawal, stops earning) from its own date; "month end" ones only
 * count from the close of their month. Runs until the end date, or `until`
 * for an open-ended one; movements dated in the future are part of the projection.
 */
export function buildStatement(
  terms: InvestmentTerms,
  movements: InvestmentMovement[],
  until: string,
  today: string,
): InvestmentPeriod[] {
  const last = terms.endOn && terms.endOn < until ? terms.endOn : until;
  const sorted = [...movements].sort((a, b) => a.movedOn.localeCompare(b.movedOn));
  const periods: InvestmentPeriod[] = [];
  // Carried with its fractions of a cent, like a spreadsheet: rounding every month would drift a cent at a time.
  let balance = terms.principalCents;
  let from = terms.startOn;

  while (from < last) {
    // Periods close at each month end; one that starts on a month end runs to the next.
    const close = monthEnd(from) > from ? monthEnd(from) : monthEnd(addDays(from, 1));
    const to = close < last ? close : last;
    const days = daysBetween(from, to);
    // A movement belongs to the period whose (from, to] holds its date; one on the very start date counts from the start.
    const inPeriod = sorted.filter((m) => (m.movedOn > from || (m.movedOn === terms.startOn && from === terms.startOn)) && m.movedOn <= to);

    let interest = balance * growth(terms, days);
    for (const m of inPeriod) {
      if (m.accrual === 'same_day') interest += m.amountCents * growth(terms, daysBetween(m.movedOn, to));
    }
    const movementCents = inPeriod.reduce((s, m) => s + m.amountCents, 0);
    const opening = balance;
    balance = opening + interest + movementCents;
    periods.push({
      from,
      to,
      days,
      openingCents: Math.round(opening),
      interestCents: Math.round(interest),
      movementCents,
      closingCents: Math.round(balance),
      projected: to > today,
    });
    from = to;
  }
  return periods;
}

/**
 * What the investment is worth on a given day: the last month-end balance plus
 * the interest accrued since (not yet credited) and that month's movements so far.
 */
export function valueOn(terms: InvestmentTerms, movements: InvestmentMovement[], on: string): number {
  if (on < terms.startOn) return 0;
  const statement = buildStatement(terms, movements, on, on);
  return statement.length ? statement[statement.length - 1]!.closingCents : terms.principalCents;
}
