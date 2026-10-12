import { randomUUID } from 'crypto';
import type { Db } from '../../db/client.js';
import type {
  Installment,
  InterestMethod,
  Loan,
  Payment,
  PaymentFrequency,
  PublicUser,
  RatePeriod,
  User,
} from '../../types/index.js';
import { badRequest, notFound } from '../../errors.js';
import { toPublicUser } from '../auth/auth.service.js';
import { amortize, buildSchedule, periodRate } from './schedule.js';
import { isIsoDate, today } from './dates.js';
import type { LiveEvents } from '../live/live.service.js';

export interface LoanInput {
  borrowerId?: unknown;
  title?: unknown;
  notes?: unknown;
  currency?: unknown;
  /** Major units (e.g. 1500.50), converted to cents here. */
  principal?: unknown;
  interestRate?: unknown;
  ratePeriod?: unknown;
  interestMethod?: unknown;
  frequency?: unknown;
  installmentsCount?: unknown;
  disbursedOn?: unknown;
  firstDueOn?: unknown;
  status?: unknown;
}

export type InstallmentState = 'paid' | 'partial' | 'overdue' | 'pending';

export interface InstallmentView extends Installment {
  paid_cents: number;
  remaining_cents: number;
  state: InstallmentState;
  /** Date of the payment that completed it (null while not fully paid). */
  paid_on: string | null;
}

export type AiFlag = 'green' | 'amber' | 'red';

/** A payment as the UI sees it: the receipt is only ever referenced, never its storage name. */
export interface PaymentView extends Omit<Payment, 'receipt_file' | 'ai_raw'> {
  has_receipt: boolean;
  /** The AI score as a color — all a debtor gets to see of it. */
  ai_flag: AiFlag | null;
  /** How much of this (approved) payment went to interest vs principal. */
  interest_cents: number;
  principal_cents: number;
}

export type LoanState = 'active' | 'overdue' | 'paid' | 'cancelled';

export interface LoanSummary {
  state: LoanState;
  totalDueCents: number;
  totalInterestCents: number;
  paidCents: number;
  remainingCents: number;
  percentPaid: number;
  interestCollectedCents: number;
  principalCollectedCents: number;
  /** Paid beyond the full schedule (a credit in the debtor's favor). */
  overpaidCents: number;
  overdueCents: number;
  overdueCount: number;
  pendingReviewCount: number;
  pendingReviewCents: number;
  installmentsPaid: number;
  nextInstallment: { number: number; dueOn: string; amountDueCents: number; daysLeft: number } | null;
  lastPaymentOn: string | null;
}

export interface LoanView extends Loan {
  borrower: Pick<PublicUser, 'id' | 'username' | 'display_name' | 'email' | 'avatar_path' | 'updated_at'>;
  summary: LoanSummary;
}

export interface LoanDetail extends LoanView {
  installments: InstallmentView[];
  payments: PaymentView[];
  /** Who lent the money — the single admin. Shown to the debtor next to the loan. */
  lender: LoanView['borrower'] | null;
}

const RATE_PERIODS: RatePeriod[] = ['annual', 'monthly'];
const METHODS: InterestMethod[] = ['french', 'simple'];
const FREQUENCIES: PaymentFrequency[] = ['weekly', 'biweekly', 'monthly'];

export function toCents(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function aiFlag(confidence: number | null): AiFlag | null {
  if (confidence === null) return null;
  return confidence >= 75 ? 'green' : confidence >= 40 ? 'amber' : 'red';
}

function toPaymentView(p: Payment, split?: { interest: number; principal: number }): PaymentView {
  const { receipt_file, ai_raw: _raw, ...rest } = p;
  return {
    ...rest,
    has_receipt: Boolean(receipt_file),
    ai_flag: aiFlag(p.ai_confidence),
    interest_cents: split?.interest ?? 0,
    principal_cents: split?.principal ?? 0,
  };
}

/**
 * Applies the approved payments, oldest first, to the installments in order —
 * each installment's interest before its principal, which is how a lender
 * books it. Everything shown on dashboards (collected interest, % paid, next
 * due date...) derives from this one pass, so nothing can drift out of sync.
 *
 * A payment first covers whatever is due up to its period's installment (the
 * first one due on or after the payment date). Anything beyond that is a
 * prepayment: it goes straight to principal — booked on the last installment
 * covered — and the installments still ahead are re-amortized over the new
 * balance, so they shrink (to zero once the balance is gone). Paying less just
 * leaves that installment partly unpaid, and the next payment covers it first.
 */
export function allocate(loan: Loan, stored: Installment[], payments: Payment[], now = today()) {
  const approved = payments
    .filter((p) => p.status === 'approved')
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at));

  // The stored rows are the original plan; prepayments rewrite the copies.
  const installments = stored.map((inst) => ({ ...inst }));
  const r = periodRate(loan.interest_rate, loan.rate_period, loan.frequency);
  const paidPerInstallment = installments.map(() => ({ interest: 0, principal: 0 }));
  const completedOn: (string | null)[] = installments.map(() => null);
  const splits = new Map<string, { interest: number; principal: number }>();
  let cursor = 0;
  let overpaid = 0;

  for (const payment of approved) {
    let left = payment.amount_cents;
    const split = { interest: 0, principal: 0 };
    const periodEnd = installments.findIndex((inst) => inst.due_on >= payment.paid_on);
    const lastCovered = periodEnd === -1 ? installments.length - 1 : periodEnd;
    while (left > 0 && cursor <= lastCovered && cursor < installments.length) {
      const inst = installments[cursor]!;
      const done = paidPerInstallment[cursor]!;
      const interestTake = Math.min(left, inst.interest_cents - done.interest);
      done.interest += interestTake;
      split.interest += interestTake;
      left -= interestTake;
      const principalTake = Math.min(left, inst.principal_cents - done.principal);
      done.principal += principalTake;
      split.principal += principalTake;
      left -= principalTake;
      if (done.interest + done.principal >= inst.amount_cents) {
        completedOn[cursor] = payment.paid_on;
        cursor++;
      }
    }

    // Past the payment's own period with money left over: prepay principal and re-amortize the rest.
    if (left > 0 && cursor > 0 && cursor < installments.length) {
      const ahead = installments.slice(cursor);
      const balance = ahead.reduce((s, inst) => s + inst.principal_cents, 0);
      const prepaid = Math.min(left, balance);
      const booked = installments[cursor - 1]!;
      booked.principal_cents += prepaid;
      booked.amount_cents += prepaid;
      paidPerInstallment[cursor - 1]!.principal += prepaid;
      split.principal += prepaid;
      left -= prepaid;
      amortize(balance - prepaid, r, ahead.length, loan.interest_method).forEach((row, i) => {
        const inst = ahead[i]!;
        inst.principal_cents = row.principalCents;
        inst.interest_cents = row.interestCents;
        inst.amount_cents = row.principalCents + row.interestCents;
      });
    }
    // Installments a prepayment brought down to nothing are settled by it.
    while (cursor < installments.length && installments[cursor]!.amount_cents === 0) {
      completedOn[cursor] = payment.paid_on;
      cursor++;
    }

    overpaid += left;
    splits.set(payment.id, split);
  }

  const views: InstallmentView[] = installments.map((inst, i) => {
    const paid = paidPerInstallment[i]!.interest + paidPerInstallment[i]!.principal;
    const remaining = inst.amount_cents - paid;
    const state: InstallmentState =
      remaining <= 0 ? 'paid' : inst.due_on < now ? 'overdue' : paid > 0 ? 'partial' : 'pending';
    return { ...inst, paid_cents: paid, remaining_cents: Math.max(0, remaining), state, paid_on: completedOn[i] ?? null };
  });

  const totalDue = installments.reduce((s, i) => s + i.amount_cents, 0);
  const totalInterest = installments.reduce((s, i) => s + i.interest_cents, 0);
  const paidCents = approved.reduce((s, p) => s + p.amount_cents, 0) - overpaid;
  const remaining = Math.max(0, totalDue - paidCents);
  const overdue = views.filter((v) => v.state === 'overdue');
  const next = views.find((v) => v.state !== 'paid');
  const pending = payments.filter((p) => p.status === 'pending');

  const state: LoanState =
    loan.status === 'cancelled' ? 'cancelled' : remaining === 0 ? 'paid' : overdue.length > 0 ? 'overdue' : 'active';

  const summary: LoanSummary = {
    state,
    totalDueCents: totalDue,
    totalInterestCents: totalInterest,
    paidCents,
    remainingCents: remaining,
    percentPaid: totalDue > 0 ? Math.min(100, (paidCents / totalDue) * 100) : 0,
    interestCollectedCents: paidPerInstallment.reduce((s, x) => s + x.interest, 0),
    principalCollectedCents: paidPerInstallment.reduce((s, x) => s + x.principal, 0),
    overpaidCents: overpaid,
    overdueCents: overdue.reduce((s, v) => s + v.remaining_cents, 0),
    overdueCount: overdue.length,
    pendingReviewCount: pending.length,
    pendingReviewCents: pending.reduce((s, p) => s + p.amount_cents, 0),
    installmentsPaid: views.filter((v) => v.state === 'paid').length,
    nextInstallment: next
      ? {
          number: next.number,
          dueOn: next.due_on,
          amountDueCents: next.remaining_cents,
          daysLeft: Math.round((Date.parse(next.due_on) - Date.parse(now)) / 86_400_000),
        }
      : null,
    lastPaymentOn: approved.length > 0 ? approved[approved.length - 1]!.paid_on : null,
  };

  return { installments: views, summary, splits };
}

export class LoansService {
  constructor(
    private db: Db,
    private live: LiveEvents,
  ) {}

  /** Tells open pages showing this loan (the lender's, and its debtor's) to reload. */
  notifyChanged(loan: Pick<Loan, 'borrower_id'>): void {
    this.live.publish(loan.borrower_id);
  }

  private borrowerOf(loan: Loan): LoanView['borrower'] {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(loan.borrower_id) as User;
    const { id, username, display_name, email, avatar_path, updated_at } = toPublicUser(user);
    return { id, username, display_name, email, avatar_path, updated_at };
  }

  private lender(): LoanDetail['lender'] {
    const admin = this.db.prepare("SELECT * FROM users WHERE role = 'admin'").get() as User | undefined;
    if (!admin) return null;
    const { id, username, display_name, email, avatar_path, updated_at } = toPublicUser(admin);
    return { id, username, display_name, email, avatar_path, updated_at };
  }

  private installmentsOf(loanId: string): Installment[] {
    return this.db.prepare('SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY number').all(loanId) as Installment[];
  }

  private paymentsOf(loanId: string): Payment[] {
    return this.db
      .prepare('SELECT * FROM payments WHERE loan_id = ? ORDER BY paid_on DESC, created_at DESC')
      .all(loanId) as Payment[];
  }

  getRaw(id: string): Loan {
    const loan = this.db.prepare('SELECT * FROM loans WHERE id = ?').get(id) as Loan | undefined;
    if (!loan) throw notFound();
    return loan;
  }

  detail(id: string): LoanDetail {
    const loan = this.getRaw(id);
    const payments = this.paymentsOf(id);
    const { installments, summary, splits } = allocate(loan, this.installmentsOf(id), payments);
    return {
      ...loan,
      borrower: this.borrowerOf(loan),
      lender: this.lender(),
      summary,
      installments,
      payments: payments.map((p) => toPaymentView(p, splits.get(p.id))),
    };
  }

  list(filter: { borrowerId?: string } = {}): LoanView[] {
    const loans = (
      filter.borrowerId
        ? this.db.prepare('SELECT * FROM loans WHERE borrower_id = ? ORDER BY created_at DESC').all(filter.borrowerId)
        : this.db.prepare('SELECT * FROM loans ORDER BY created_at DESC').all()
    ) as Loan[];
    return loans.map((loan) => {
      const { summary } = allocate(loan, this.installmentsOf(loan.id), this.paymentsOf(loan.id));
      return { ...loan, borrower: this.borrowerOf(loan), summary };
    });
  }

  /** Every loan with its full detail — what the dashboards and charts are built from. */
  listDetailed(filter: { borrowerId?: string } = {}): LoanDetail[] {
    const ids = (
      filter.borrowerId
        ? this.db.prepare('SELECT id FROM loans WHERE borrower_id = ? ORDER BY created_at DESC').all(filter.borrowerId)
        : this.db.prepare('SELECT id FROM loans ORDER BY created_at DESC').all()
    ) as { id: string }[];
    return ids.map(({ id }) => this.detail(id));
  }

  private validate(input: LoanInput, existing?: Loan) {
    const pick = <T>(value: unknown, fallback: T | undefined): unknown => (value === undefined ? fallback : value);

    const borrowerId = pick(input.borrowerId, existing?.borrower_id);
    if (typeof borrowerId !== 'string') throw badRequest('loans.invalidBorrower');
    const borrower = this.db.prepare('SELECT role FROM users WHERE id = ?').get(borrowerId) as { role: string } | undefined;
    if (!borrower || borrower.role !== 'user') throw badRequest('loans.invalidBorrower');

    const title = pick(input.title, existing?.title);
    if (typeof title !== 'string' || !title.trim() || title.length > 120) throw badRequest('loans.invalidTitle');

    const notes = pick(input.notes, existing?.notes);
    if (notes !== null && notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) {
      throw badRequest('error.invalidInput');
    }

    const currency = pick(input.currency, existing?.currency);
    if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) throw badRequest('loans.invalidCurrency');

    const principalCents =
      input.principal === undefined ? existing?.principal_cents : toCents(input.principal);
    if (!principalCents || principalCents <= 0 || principalCents > 1e13) throw badRequest('loans.invalidAmount');

    const rate = Number(pick(input.interestRate, existing?.interest_rate));
    if (!Number.isFinite(rate) || rate < 0 || rate > 1000) throw badRequest('loans.invalidRate');

    const ratePeriod = pick(input.ratePeriod, existing?.rate_period) as RatePeriod;
    const interestMethod = pick(input.interestMethod, existing?.interest_method) as InterestMethod;
    const frequency = pick(input.frequency, existing?.frequency) as PaymentFrequency;
    if (!RATE_PERIODS.includes(ratePeriod) || !METHODS.includes(interestMethod) || !FREQUENCIES.includes(frequency)) {
      throw badRequest('error.invalidInput');
    }

    const installmentsCount = Number(pick(input.installmentsCount, existing?.installments_count));
    if (!Number.isInteger(installmentsCount) || installmentsCount < 1 || installmentsCount > 600) {
      throw badRequest('loans.invalidInstallments');
    }

    const disbursedOn = pick(input.disbursedOn, existing?.disbursed_on);
    const firstDueOn = pick(input.firstDueOn, existing?.first_due_on);
    if (!isIsoDate(disbursedOn) || !isIsoDate(firstDueOn) || firstDueOn < disbursedOn) {
      throw badRequest('loans.invalidDates');
    }

    const status = pick(input.status, existing?.status ?? 'active');
    if (status !== 'active' && status !== 'cancelled') throw badRequest('error.invalidInput');

    return {
      borrowerId,
      title: title.trim(),
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      currency: currency.toUpperCase(),
      principalCents,
      interestRate: rate,
      ratePeriod,
      interestMethod,
      frequency,
      installmentsCount,
      disbursedOn,
      firstDueOn,
      status,
    };
  }

  private writeSchedule(loanId: string, v: ReturnType<LoansService['validate']>): void {
    this.db.prepare('DELETE FROM loan_installments WHERE loan_id = ?').run(loanId);
    const insert = this.db.prepare(
      `INSERT INTO loan_installments (id, loan_id, number, due_on, amount_cents, principal_cents, interest_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of buildSchedule(v)) {
      insert.run(randomUUID(), loanId, row.number, row.dueOn, row.amountCents, row.principalCents, row.interestCents);
    }
  }

  create(input: LoanInput): LoanDetail {
    const v = this.validate(input);
    const id = randomUUID();
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO loans (id, borrower_id, title, notes, currency, principal_cents, interest_rate, rate_period,
             interest_method, frequency, installments_count, disbursed_on, first_due_on, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          v.borrowerId,
          v.title,
          v.notes,
          v.currency,
          v.principalCents,
          v.interestRate,
          v.ratePeriod,
          v.interestMethod,
          v.frequency,
          v.installmentsCount,
          v.disbursedOn,
          v.firstDueOn,
          v.status,
        );
      this.writeSchedule(id, v);
    })();
    this.live.publish(v.borrowerId);
    return this.detail(id);
  }

  /** Changing any financial term regenerates the schedule; payments re-allocate on their own since they're never tied to an installment. */
  update(id: string, input: LoanInput): LoanDetail {
    const existing = this.getRaw(id);
    const v = this.validate(input, existing);
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE loans SET borrower_id = ?, title = ?, notes = ?, currency = ?, principal_cents = ?, interest_rate = ?,
             rate_period = ?, interest_method = ?, frequency = ?, installments_count = ?, disbursed_on = ?,
             first_due_on = ?, status = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(
          v.borrowerId,
          v.title,
          v.notes,
          v.currency,
          v.principalCents,
          v.interestRate,
          v.ratePeriod,
          v.interestMethod,
          v.frequency,
          v.installmentsCount,
          v.disbursedOn,
          v.firstDueOn,
          v.status,
          id,
        );
      const termsChanged =
        v.principalCents !== existing.principal_cents ||
        v.interestRate !== existing.interest_rate ||
        v.ratePeriod !== existing.rate_period ||
        v.interestMethod !== existing.interest_method ||
        v.frequency !== existing.frequency ||
        v.installmentsCount !== existing.installments_count ||
        v.firstDueOn !== existing.first_due_on;
      if (termsChanged) this.writeSchedule(id, v);
    })();
    // Both debtors when the loan was moved to someone else.
    this.live.publish(existing.borrower_id);
    if (v.borrowerId !== existing.borrower_id) this.live.publish(v.borrowerId);
    return this.detail(id);
  }

  /** Receipt files are removed by the caller (PaymentsService), which knows where they live. */
  remove(id: string): void {
    const loan = this.getRaw(id);
    this.db.prepare('DELETE FROM loans WHERE id = ?').run(id);
    this.live.publish(loan.borrower_id);
  }

  /** Preview for the loan form, so the admin sees the schedule before saving. */
  preview(input: LoanInput) {
    const principalCents = toCents(input.principal);
    const rate = Number(input.interestRate);
    const count = Number(input.installmentsCount);
    if (
      !principalCents ||
      principalCents <= 0 ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 600 ||
      !isIsoDate(input.firstDueOn) ||
      !RATE_PERIODS.includes(input.ratePeriod as RatePeriod) ||
      !METHODS.includes(input.interestMethod as InterestMethod) ||
      !FREQUENCIES.includes(input.frequency as PaymentFrequency)
    ) {
      throw badRequest('error.invalidInput');
    }
    return buildSchedule({
      principalCents,
      interestRate: rate,
      ratePeriod: input.ratePeriod as RatePeriod,
      interestMethod: input.interestMethod as InterestMethod,
      frequency: input.frequency as PaymentFrequency,
      installmentsCount: count,
      firstDueOn: input.firstDueOn,
    });
  }

  /**
   * The same detail a debtor is allowed to see: the AI's verdict only as a
   * color flag — the score, what it read and its notes are for the lender.
   */
  detailForDebtor(id: string): LoanDetail {
    const detail = this.detail(id);
    return {
      ...detail,
      payments: detail.payments.map((p) => ({
        ...p,
        ai_confidence: null,
        ai_amount_cents: null,
        ai_date: null,
        ai_reason: null,
        ai_notes: null,
        ai_model: null,
      })),
    };
  }
}
