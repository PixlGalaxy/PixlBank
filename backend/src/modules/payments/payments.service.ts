import { randomUUID } from 'crypto';
import { promises as fs, mkdirSync } from 'fs';
import { join } from 'path';
import type { Db } from '../../db/client.js';
import type { Loan, Payment, User } from '../../types/index.js';
import type { EmailKey, EmailTranslate } from '../../i18n/index.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { isIsoDate, today } from '../loans/dates.js';
import type { LoansService } from '../loans/loans.service.js';
import type { MailService, Recipient } from '../mail/mail.service.js';
import type { ReceiptVerifier, ReasonCode } from './receipt-verifier.js';
import { logger } from '../../logger.js';

export const RECEIPT_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Below this score the lender gets the "looks wrong" alert instead of a plain "to review". */
export const SUSPICIOUS_BELOW = 40;

export function formatMoney(cents: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function recipientOf(user: User): Recipient {
  return { email: user.email, name: user.display_name || user.username, language: user.language };
}

/**
 * Payments. A debtor's report always lands as 'pending' and only the lender
 * approves or rejects it; the vision model runs afterwards, in the background,
 * and only attaches a confidence score and what it read off the receipt.
 */
export class PaymentsService {
  /** Verifications run one at a time so a burst of reports doesn't pile up on Ollama. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private db: Db,
    private loans: LoansService,
    private verifier: ReceiptVerifier,
    private mail: MailService,
    private te: EmailTranslate,
    private receiptsDir: string,
  ) {
    mkdirSync(receiptsDir, { recursive: true });
  }

  private get(id: string): Payment {
    const payment = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment | undefined;
    if (!payment) throw notFound();
    return payment;
  }

  private admin(): User | undefined {
    return this.db.prepare("SELECT * FROM users WHERE role = 'admin'").get() as User | undefined;
  }

  private borrower(loan: Loan): User {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(loan.borrower_id) as User;
  }

  private remainingCents(loan: Loan): number {
    return this.loans.detail(loan.id).summary.remainingCents;
  }

  private validateAmountAndDate(amountCents: number | null, paidOn: unknown): asserts paidOn is string {
    if (!amountCents || amountCents <= 0 || amountCents > 1e13) throw badRequest('payments.invalidAmount');
    if (!isIsoDate(paidOn) || paidOn > today()) throw badRequest('payments.invalidDate');
  }

  private cleanNote(note: unknown): string | null {
    if (note === undefined || note === null) return null;
    if (typeof note !== 'string' || note.length > 1000) throw badRequest('error.invalidInput');
    return note.trim() || null;
  }

  receiptFile(paymentId: string, viewer: User): { path: string; mime: string } {
    const payment = this.get(paymentId);
    const loan = this.loans.getRaw(payment.loan_id);
    if (viewer.role !== 'admin' && loan.borrower_id !== viewer.id) throw notFound();
    if (!payment.receipt_file) throw notFound('payments.noReceipt');
    return { path: join(this.receiptsDir, payment.receipt_file), mime: payment.receipt_mime ?? 'application/octet-stream' };
  }

  /** Lender registers a payment by hand (cash, etc.) — no receipt, approved immediately. */
  addManual(admin: User, loanId: string, amountCents: number | null, paidOn: unknown, note: unknown): Payment {
    const loan = this.loans.getRaw(loanId);
    this.validateAmountAndDate(amountCents, paidOn);
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO payments (id, loan_id, amount_cents, paid_on, status, source, note, ai_status, reviewed_by, reviewed_at, created_by)
         VALUES (?, ?, ?, ?, 'approved', 'admin', ?, 'not_required', ?, datetime('now'), ?)`,
      )
      .run(id, loan.id, amountCents, paidOn, this.cleanNote(note), admin.id, admin.id);
    logger.system.info(`"${admin.username}" registered a payment of ${amountCents! / 100} ${loan.currency} on "${loan.title}"`);
    return this.get(id);
  }

  /**
   * Debtor reports a payment with a receipt image. Answers as soon as the
   * record and the image are stored; the AI check is queued behind it.
   */
  async report(
    debtor: User,
    loanId: string,
    amountCents: number | null,
    paidOn: unknown,
    note: unknown,
    receipt: { buffer: Buffer; mime: string } | null,
  ): Promise<{ paymentId: string }> {
    const loan = this.loans.getRaw(loanId);
    if (loan.borrower_id !== debtor.id) throw notFound();
    if (loan.status !== 'active') throw badRequest('loans.notActive');
    this.validateAmountAndDate(amountCents, paidOn);
    if (!receipt) throw badRequest('payments.receiptRequired');
    const ext = RECEIPT_EXT_BY_MIME[receipt.mime];
    if (!ext) throw badRequest('payments.receiptInvalidType');
    if (amountCents! > this.remainingCents(loan)) throw badRequest('payments.exceedsBalance');
    const cleanNote = this.cleanNote(note);

    const id = randomUUID();
    const file = `${id}.${ext}`;
    await fs.writeFile(join(this.receiptsDir, file), receipt.buffer);
    this.db
      .prepare(
        `INSERT INTO payments (id, loan_id, amount_cents, paid_on, status, source, note, receipt_file, receipt_mime, ai_status, created_by)
         VALUES (?, ?, ?, ?, 'pending', 'debtor', ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        loan.id,
        amountCents,
        paidOn,
        cleanNote,
        file,
        receipt.mime,
        this.verifier.isConfigured() ? 'pending' : 'disabled',
        debtor.id,
      );
    logger.system.info(`"${debtor.username}" reported a payment of ${amountCents! / 100} ${loan.currency} on "${loan.title}"`);

    const to = recipientOf(debtor);
    void this.mail.send(to, 'payment-received', 'email.paymentReceived.subject', 'email.paymentReceived.body', {
      loan: loan.title,
      amount: formatMoney(amountCents!, loan.currency, to.language),
      date: paidOn,
    });

    this.enqueue(id, receipt.buffer);
    return { paymentId: id };
  }

  private enqueue(paymentId: string, image?: Buffer): void {
    this.queue = this.queue
      .then(() => this.runVerification(paymentId, image))
      .catch((err) => logger.error(`Receipt verification for payment ${paymentId} crashed`, err));
  }

  /** Lender asks the AI to look again (e.g. after Ollama was down or a model change). */
  reverify(paymentId: string): void {
    const payment = this.get(paymentId);
    if (!payment.receipt_file) throw badRequest('payments.noReceipt');
    this.db.prepare("UPDATE payments SET ai_status = 'pending' WHERE id = ?").run(paymentId);
    this.enqueue(paymentId);
  }

  /** Re-queues checks interrupted by a restart, so nothing stays "analyzing" forever. */
  resumePending(): void {
    const rows = this.db
      .prepare("SELECT id FROM payments WHERE ai_status = 'pending' AND receipt_file IS NOT NULL ORDER BY created_at")
      .all() as { id: string }[];
    for (const { id } of rows) this.enqueue(id);
    if (rows.length > 0) logger.info(`Resuming ${rows.length} receipt verification(s)`);
  }

  private async runVerification(paymentId: string, image?: Buffer): Promise<void> {
    let payment: Payment;
    try {
      payment = this.get(paymentId);
    } catch {
      return; // Deleted while queued.
    }
    if (!payment.receipt_file) return;
    const buffer = image ?? (await fs.readFile(join(this.receiptsDir, payment.receipt_file)));
    const result = await this.verifier.verify(buffer, payment.amount_cents);

    const scored = result.outcome === 'scored' ? result : null;
    this.db
      .prepare(
        `UPDATE payments SET ai_status = ?, ai_confidence = ?, ai_amount_cents = ?, ai_date = ?, ai_reason = ?, ai_notes = ?,
           ai_raw = ?, ai_model = ?, ai_checked_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        scored ? (scored.checksPassed ? 'valid' : 'invalid') : result.outcome,
        scored?.confidence ?? null,
        scored?.amountCents ?? null,
        scored?.extraction.date ?? null,
        result.reason,
        scored?.extraction.notes ?? null,
        result.raw ?? null,
        result.model ?? null,
        paymentId,
      );

    const updated = this.get(paymentId);
    // Already decided by the lender while the model was running — nothing to alert about.
    if (updated.status === 'pending') await this.notifyAdmin(updated, result.reason, scored?.confidence ?? null);
  }

  reasonText(language: string, payment: Pick<Payment, 'ai_amount_cents' | 'ai_date'>, reason: ReasonCode, currency: string): string {
    return this.te(language, `receipt.reason.${reason}` as EmailKey, {
      days: this.verifier.getConfig().maxAgeDays,
      date: payment.ai_date ?? '—',
      detected: payment.ai_amount_cents === null ? '—' : formatMoney(payment.ai_amount_cents, currency, language),
    });
  }

  private async notifyAdmin(payment: Payment, reason: ReasonCode, confidence: number | null): Promise<void> {
    const admin = this.admin();
    if (!admin) return;
    const loan = this.loans.getRaw(payment.loan_id);
    const debtor = this.borrower(loan);
    const to = recipientOf(admin);
    const suspicious = confidence !== null && confidence < SUSPICIOUS_BELOW;
    await this.mail.send(
      to,
      suspicious ? 'admin-receipt-suspicious' : 'admin-payment-review',
      suspicious ? 'email.adminReceiptRejected.subject' : 'email.adminPaymentReview.subject',
      suspicious ? 'email.adminReceiptRejected.body' : 'email.adminPaymentReview.body',
      {
        loan: loan.title,
        debtor: debtor.display_name || debtor.username,
        amount: formatMoney(payment.amount_cents, loan.currency, to.language),
        date: payment.paid_on,
        score: confidence === null ? '—' : `${confidence}%`,
        reason: this.reasonText(to.language, payment, reason, loan.currency),
      },
    );
  }

  /** The lender's call — the only thing that ever approves or rejects a reported payment. */
  async review(admin: User, paymentId: string, decision: unknown, note: unknown): Promise<Payment> {
    if (decision !== 'approved' && decision !== 'rejected') throw badRequest('error.invalidInput');
    const reviewNote = this.cleanNote(note);
    const payment = this.get(paymentId);
    const loan = this.loans.getRaw(payment.loan_id);
    this.db
      .prepare(
        "UPDATE payments SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ?",
      )
      .run(decision, admin.id, reviewNote, paymentId);
    logger.system.info(`"${admin.username}" ${decision} a payment of ${payment.amount_cents / 100} ${loan.currency} on "${loan.title}"`);

    if (payment.status !== decision && payment.source === 'debtor') {
      const debtor = recipientOf(this.borrower(loan));
      const vars = {
        loan: loan.title,
        amount: formatMoney(payment.amount_cents, loan.currency, debtor.language),
        date: payment.paid_on,
        remaining: formatMoney(this.remainingCents(loan), loan.currency, debtor.language),
        reason: reviewNote ?? this.te(debtor.language, 'receipt.reason.manual'),
      };
      void this.mail.send(
        debtor,
        decision === 'approved' ? 'payment-approved' : 'payment-rejected',
        decision === 'approved' ? 'email.paymentApproved.subject' : 'email.paymentRejected.subject',
        decision === 'approved' ? 'email.paymentApproved.body' : 'email.paymentRejected.body',
        vars,
      );
    }
    return this.get(paymentId);
  }

  async remove(paymentId: string, actor: User): Promise<void> {
    if (actor.role !== 'admin') throw forbidden();
    const payment = this.get(paymentId);
    this.db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
    if (payment.receipt_file) await fs.rm(join(this.receiptsDir, payment.receipt_file), { force: true });
  }

  /** Called before a loan is deleted, since the cascade drops the rows but not the files. */
  async removeLoanReceipts(loanId: string): Promise<void> {
    const files = this.db
      .prepare('SELECT receipt_file FROM payments WHERE loan_id = ? AND receipt_file IS NOT NULL')
      .all(loanId) as { receipt_file: string }[];
    await Promise.all(files.map((f) => fs.rm(join(this.receiptsDir, f.receipt_file), { force: true })));
  }
}
