import { randomUUID } from 'crypto';
import type { Db } from '../../db/client.js';
import type { PublicUser, RatePeriod, User } from '../../types/index.js';
import { badRequest, notFound } from '../../errors.js';
import { toPublicUser } from '../auth/auth.service.js';
import { addDays, isIsoDate, today } from '../loans/dates.js';
import { toCents } from '../loans/loans.service.js';
import type { LiveEvents } from '../live/live.service.js';
import {
  buildStatement,
  valueOn,
  type AccrualStart,
  type InvestmentMovement,
  type InvestmentPeriod,
  type InvestmentTerms,
} from './investment.calc.js';

export interface InvestmentRow {
  id: string;
  owner_id: string;
  title: string;
  notes: string | null;
  currency: string;
  principal_cents: number;
  interest_rate: number;
  rate_period: RatePeriod;
  start_on: string;
  end_on: string | null;
  created_at: string;
  updated_at: string;
}

interface MovementRow {
  id: string;
  investment_id: string;
  moved_on: string;
  amount_cents: number;
  accrual: AccrualStart;
  note: string | null;
  created_at: string;
}

export interface InvestmentSummary {
  /** Principal plus every contribution up to today. */
  contributedCents: number;
  withdrawnCents: number;
  valueTodayCents: number;
  /** Earned so far: today's value minus the net money put in. */
  interestToDateCents: number;
  /** The date the projection runs to: the one asked for (at most the end date), or the default. */
  horizonOn: string;
  valueAtHorizonCents: number;
  interestAtHorizonCents: number;
}

export interface InvestmentView extends InvestmentRow {
  owner: Pick<PublicUser, 'id' | 'username' | 'display_name' | 'email' | 'avatar_path' | 'updated_at' | 'is_active'>;
  movements: InvestmentMovement[];
  statement: InvestmentPeriod[];
  summary: InvestmentSummary;
}

export interface InvestmentInput {
  ownerId?: unknown;
  title?: unknown;
  notes?: unknown;
  currency?: unknown;
  /** Major units. */
  principal?: unknown;
  interestRate?: unknown;
  ratePeriod?: unknown;
  startOn?: unknown;
  /** null or '' for open-ended. */
  endOn?: unknown;
}

export interface MovementInput {
  movedOn?: unknown;
  /** Major units, always positive; `kind` says which way it goes. */
  amount?: unknown;
  kind?: unknown;
  accrual?: unknown;
  note?: unknown;
}

/** How far an open-ended investment is projected when no date is asked for. */
const DEFAULT_HORIZON_DAYS = 2 * 365;
/** The furthest a projection may reach: every month is computed, so the range has to stay sane. */
const MAX_HORIZON_DAYS = 50 * 365;

const termsOf = (row: InvestmentRow): InvestmentTerms => ({
  principalCents: row.principal_cents,
  interestRate: row.interest_rate,
  ratePeriod: row.rate_period,
  startOn: row.start_on,
  endOn: row.end_on,
});

const toMovement = (m: MovementRow): InvestmentMovement => ({
  id: m.id,
  movedOn: m.moved_on,
  amountCents: m.amount_cents,
  accrual: m.accrual,
  note: m.note,
});

/**
 * Investments whose interest compounds into the balance (see investment.calc.ts).
 * Only the inputs are stored — principal, rate, dates and movements — and the
 * month-by-month statement is rebuilt on every read, so editing anything
 * recalculates everything after it.
 */
export class InvestmentsService {
  constructor(
    private db: Db,
    private live: LiveEvents,
  ) {}

  private row(id: string): InvestmentRow {
    const row = this.db.prepare('SELECT * FROM investments WHERE id = ?').get(id) as InvestmentRow | undefined;
    if (!row) throw notFound();
    return row;
  }

  ownerOf(id: string): string {
    return this.row(id).owner_id;
  }

  private movementsOf(id: string): InvestmentMovement[] {
    return (
      this.db.prepare('SELECT * FROM investment_movements WHERE investment_id = ? ORDER BY moved_on, created_at').all(id) as MovementRow[]
    ).map(toMovement);
  }

  /**
   * `ignoreEnd` projects as if the investment carried on past its end date —
   * "what if I left it in" — without changing what's stored.
   */
  private view(row: InvestmentRow, horizon?: string, ignoreEnd = false): InvestmentView {
    const now = today();
    const endOn = ignoreEnd ? null : row.end_on;
    const terms = { ...termsOf(row), endOn };
    const movements = this.movementsOf(row.id);
    // "How much will it be worth on…": any date asked for, capped at the end date; by default the end
    // date, or a couple of years ahead for an open-ended one (never short of the real end date).
    const from = now > row.start_on ? now : row.start_on;
    const latest = addDays(from, MAX_HORIZON_DAYS);
    const asked = horizon && horizon > row.start_on ? (horizon < latest ? horizon : latest) : null;
    const ahead = addDays(from, DEFAULT_HORIZON_DAYS);
    const fallback = endOn ?? (row.end_on && row.end_on > ahead ? row.end_on : ahead);
    const until = asked && (!endOn || asked < endOn) ? asked : fallback;
    const statement = buildStatement(terms, movements, until, now);

    const netUntil = (on: string) =>
      row.principal_cents + movements.filter((m) => m.movedOn <= on).reduce((s, m) => s + m.amountCents, 0);
    const valueToday = valueOn(terms, movements, now);
    const valueAtHorizon = statement.length ? statement[statement.length - 1]!.closingCents : row.principal_cents;
    const past = movements.filter((m) => m.movedOn <= now);
    const owner = toPublicUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(row.owner_id) as User);

    return {
      ...row,
      owner: {
        id: owner.id,
        username: owner.username,
        display_name: owner.display_name,
        email: owner.email,
        avatar_path: owner.avatar_path,
        updated_at: owner.updated_at,
        is_active: owner.is_active,
      },
      movements,
      statement,
      summary: {
        contributedCents: row.principal_cents + past.filter((m) => m.amountCents > 0).reduce((s, m) => s + m.amountCents, 0),
        withdrawnCents: -past.filter((m) => m.amountCents < 0).reduce((s, m) => s + m.amountCents, 0),
        valueTodayCents: valueToday,
        interestToDateCents: now < row.start_on ? 0 : valueToday - netUntil(now),
        horizonOn: until,
        valueAtHorizonCents: valueAtHorizon,
        interestAtHorizonCents: valueAtHorizon - netUntil(until),
      },
    };
  }

  detail(id: string, horizon?: string, ignoreEnd = false): InvestmentView {
    return this.view(this.row(id), horizon, ignoreEnd);
  }

  list(ownerId?: string): InvestmentView[] {
    const rows = (
      ownerId
        ? this.db.prepare('SELECT * FROM investments WHERE owner_id = ? ORDER BY start_on DESC').all(ownerId)
        : this.db.prepare('SELECT * FROM investments ORDER BY start_on DESC').all()
    ) as InvestmentRow[];
    return rows.map((r) => this.view(r));
  }

  private validate(input: InvestmentInput, existing?: InvestmentRow) {
    const pick = (value: unknown, fallback: unknown) => (value === undefined ? fallback : value);

    const ownerId = pick(input.ownerId, existing?.owner_id);
    if (typeof ownerId !== 'string') throw badRequest('loans.invalidBorrower');
    // Accounts without a login (a company, say) can hold investments too — only the admin can't.
    const owner = this.db.prepare('SELECT role FROM users WHERE id = ?').get(ownerId) as { role: string } | undefined;
    if (!owner || owner.role !== 'user') throw badRequest('loans.invalidBorrower');

    const title = pick(input.title, existing?.title);
    if (typeof title !== 'string' || !title.trim() || title.length > 120) throw badRequest('loans.invalidTitle');

    const notes = pick(input.notes, existing?.notes);
    if (notes !== null && notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) throw badRequest('error.invalidInput');

    const currency = pick(input.currency, existing?.currency);
    if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) throw badRequest('loans.invalidCurrency');

    const principalCents = input.principal === undefined ? existing?.principal_cents : toCents(input.principal);
    if (!principalCents || principalCents <= 0 || principalCents > 1e13) throw badRequest('loans.invalidAmount');

    const rate = Number(pick(input.interestRate, existing?.interest_rate));
    if (!Number.isFinite(rate) || rate < 0 || rate > 1000) throw badRequest('loans.invalidRate');

    const ratePeriod = pick(input.ratePeriod, existing?.rate_period);
    if (ratePeriod !== 'annual' && ratePeriod !== 'monthly') throw badRequest('error.invalidInput');

    const startOn = pick(input.startOn, existing?.start_on);
    const rawEnd = pick(input.endOn, existing?.end_on ?? null);
    const endOn = rawEnd === '' ? null : rawEnd;
    if (!isIsoDate(startOn) || (endOn !== null && (!isIsoDate(endOn) || endOn <= startOn))) throw badRequest('loans.invalidDates');

    return {
      ownerId,
      title: title.trim(),
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      currency: currency.toUpperCase(),
      principalCents,
      rate,
      ratePeriod: ratePeriod as RatePeriod,
      startOn,
      endOn: endOn as string | null,
    };
  }

  create(input: InvestmentInput): InvestmentView {
    const v = this.validate(input);
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO investments (id, owner_id, title, notes, currency, principal_cents, interest_rate, rate_period, start_on, end_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, v.ownerId, v.title, v.notes, v.currency, v.principalCents, v.rate, v.ratePeriod, v.startOn, v.endOn);
    this.live.publish(v.ownerId);
    return this.detail(id);
  }

  update(id: string, input: InvestmentInput): InvestmentView {
    const existing = this.row(id);
    const v = this.validate(input, existing);
    this.assertMovementsFit(id, v.startOn, v.endOn);
    this.db
      .prepare(
        `UPDATE investments SET owner_id = ?, title = ?, notes = ?, currency = ?, principal_cents = ?, interest_rate = ?,
           rate_period = ?, start_on = ?, end_on = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(v.ownerId, v.title, v.notes, v.currency, v.principalCents, v.rate, v.ratePeriod, v.startOn, v.endOn, id);
    this.live.publish(existing.owner_id);
    if (v.ownerId !== existing.owner_id) this.live.publish(v.ownerId);
    return this.detail(id);
  }

  /** New dates can't leave a contribution outside the investment's life. */
  private assertMovementsFit(id: string, startOn: string, endOn: string | null): void {
    const outside = this.db
      .prepare('SELECT 1 FROM investment_movements WHERE investment_id = ? AND (moved_on < ? OR moved_on > ?) LIMIT 1')
      .get(id, startOn, endOn ?? '9999-12-31');
    if (outside) throw badRequest('investments.movementOutsideDates');
  }

  remove(id: string): void {
    const row = this.row(id);
    this.db.prepare('DELETE FROM investments WHERE id = ?').run(id);
    this.live.publish(row.owner_id);
  }

  addMovement(id: string, input: MovementInput): InvestmentView {
    const row = this.row(id);
    const movedOn = input.movedOn;
    if (!isIsoDate(movedOn) || movedOn < row.start_on || (row.end_on !== null && movedOn > row.end_on)) {
      throw badRequest('investments.movementOutsideDates');
    }
    const cents = toCents(input.amount);
    if (!cents || cents <= 0 || cents > 1e13) throw badRequest('loans.invalidAmount');
    if (input.kind !== 'contribution' && input.kind !== 'withdrawal') throw badRequest('error.invalidInput');
    if (input.accrual !== 'same_day' && input.accrual !== 'month_end') throw badRequest('error.invalidInput');
    const note = input.note;
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 500)) throw badRequest('error.invalidInput');

    const amountCents = input.kind === 'withdrawal' ? -cents : cents;
    // A withdrawal can't take out more than the investment is worth that day.
    if (amountCents < 0) {
      const available = valueOn(termsOf(row), this.movementsOf(id), movedOn);
      if (cents > available) throw badRequest('investments.withdrawalTooLarge');
    }
    this.db
      .prepare('INSERT INTO investment_movements (id, investment_id, moved_on, amount_cents, accrual, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), id, movedOn, amountCents, input.accrual, typeof note === 'string' && note.trim() ? note.trim() : null);
    this.db.prepare("UPDATE investments SET updated_at = datetime('now') WHERE id = ?").run(id);
    this.live.publish(row.owner_id);
    return this.detail(id);
  }

  removeMovement(id: string, movementId: string): InvestmentView {
    const row = this.row(id);
    const result = this.db.prepare('DELETE FROM investment_movements WHERE id = ? AND investment_id = ?').run(movementId, id);
    if (result.changes === 0) throw notFound();
    this.live.publish(row.owner_id);
    return this.detail(id);
  }
}
