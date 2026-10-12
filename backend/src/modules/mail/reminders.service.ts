import type { Db } from '../../db/client.js';
import type { SettingsService } from '../../db/settings.js';
import type { User } from '../../types/index.js';
import { SETTINGS_KEYS } from '../admin/settings-keys.js';
import { addDays, today } from '../loans/dates.js';
import type { LoanDetail, LoansService } from '../loans/loans.service.js';
import { formatMoney } from '../payments/payments.service.js';
import type { MailService } from './mail.service.js';
import { logger } from '../../logger.js';

type Kind = 'upcoming' | 'due' | 'overdue';


/**
 * Payment reminders to debtors. Once a day (from `reminder_hour` on) every
 * unpaid installment of an active loan gets at most one email of each kind:
 * N days before it's due, on the day itself, and once when it becomes overdue.
 * `reminders_sent` makes this idempotent across restarts and hourly ticks.
 */
export class RemindersService {
  constructor(
    private db: Db,
    private settings: SettingsService,
    private loans: LoansService,
    private mail: MailService,
  ) {}

  getConfig() {
    return {
      enabled: this.settings.getBoolean(SETTINGS_KEYS.remindersEnabled, true),
      daysBefore: this.settings.getNumber(SETTINGS_KEYS.reminderDaysBefore, 3),
      hour: this.settings.getNumber(SETTINGS_KEYS.reminderHour, 9),
      lastRun: this.settings.getOptionalString(SETTINGS_KEYS.remindersLastRun) ?? null,
    };
  }

  start(): void {
    const tick = () => void this.tick().catch((err) => logger.error('Reminder run failed', err));
    setTimeout(tick, 30_000).unref();
    setInterval(tick, 60 * 60 * 1000).unref();
  }

  private async tick(): Promise<void> {
    const c = this.getConfig();
    const now = today();
    if (!c.enabled || !this.mail.isConfigured() || c.lastRun === now || new Date().getHours() < c.hour) return;
    const sent = await this.runDaily();
    this.settings.set(SETTINGS_KEYS.remindersLastRun, now);
    logger.info(`Daily reminders: ${sent} email(s) sent`);
  }

  private borrower(loan: LoanDetail): User | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(loan.borrower_id) as User | undefined;
  }

  private async sendFor(loan: LoanDetail, kind: Kind, installment: LoanDetail['installments'][number]): Promise<boolean> {
    const user = this.borrower(loan);
    if (!user) return false;
    const language = user.language;
    const ok = await this.mail.send(
      { email: user.email, name: user.display_name || user.username, language, userId: user.id },
      `reminder-${kind}`,
      {
        loan: loan.title,
        number: installment.number,
        total: loan.installments_count,
        amount: formatMoney(installment.remaining_cents, loan.currency, language),
        date: installment.due_on,
        remaining: formatMoney(loan.summary.remainingCents, loan.currency, language),
        overdue: formatMoney(loan.summary.overdueCents, loan.currency, language),
      },
    );
    return ok;
  }

  async runDaily(): Promise<number> {
    const c = this.getConfig();
    const now = today();
    const upcomingOn = addDays(now, c.daysBefore);
    const already = this.db.prepare('SELECT 1 FROM reminders_sent WHERE installment_id = ? AND kind = ?');
    const mark = this.db.prepare('INSERT OR IGNORE INTO reminders_sent (installment_id, kind) VALUES (?, ?)');
    let sent = 0;

    for (const loan of this.loans.listDetailed()) {
      if (loan.summary.state === 'cancelled' || loan.summary.state === 'paid') continue;
      for (const inst of loan.installments) {
        if (inst.state === 'paid') continue;
        const kind: Kind | null =
          inst.due_on < now ? 'overdue' : inst.due_on === now ? 'due' : c.daysBefore > 0 && inst.due_on === upcomingOn ? 'upcoming' : null;
        if (!kind || already.get(inst.id, kind)) continue;
        if (await this.sendFor(loan, kind, inst)) {
          mark.run(inst.id, kind);
          sent++;
        }
      }
    }
    return sent;
  }

  /** "Send reminder now" from the User Manager: the next unpaid installment, regardless of what was sent before. */
  async sendNow(loanId: string): Promise<boolean> {
    const loan = this.loans.detail(loanId);
    const next = loan.installments.find((i) => i.state !== 'paid');
    if (!next) return false;
    const kind: Kind = next.due_on < today() ? 'overdue' : next.due_on === today() ? 'due' : 'upcoming';
    return this.sendFor(loan, kind, next);
  }
}
