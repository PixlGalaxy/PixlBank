import type { Db } from '../../db/client.js';
import type { Installment, Loan, Payment } from '../../types/index.js';
import { addDays, daysBetween, today } from './dates.js';
import { allocate } from './loans.service.js';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ScoreFactors {
  onTime: number;
  slightlyLate: number;
  late: number;
  veryLate: number;
  overdueUnpaid: number;
  rejectedReceipts: number;
  completedLoans: number;
}

export interface CreditScore {
  grade: Grade;
  /** 0-100, the number behind the letter. */
  points: number;
  /** Points 30 days ago, for the trend arrow. */
  previousPoints: number;
  trend: 'up' | 'down' | 'flat';
  /** True while something is actively dragging it down (installments overdue right now). */
  willDrop: boolean;
  /** No installment has come due yet, so the grade is just the starting one. */
  noHistory: boolean;
  /** Points needed to reach the next grade up (null at A). */
  toNextGrade: number | null;
  factors: ScoreFactors;
}

/** Where every debtor starts: a C, neither trusted nor distrusted. */
const START = 60;

export const POINTS = {
  onTime: 4,
  slightlyLate: 0, // 1-7 days
  late: -4, // 8-30 days
  veryLate: -8, // 31+ days
  rejectedReceipt: -5,
  completedLoan: 8,
} as const;

/** Lower bound of each grade, best first. */
const GRADE_FLOORS: [Grade, number][] = [
  ['A', 85],
  ['B', 70],
  ['C', 55],
  ['D', 40],
  ['E', 0],
];

export function gradeFor(points: number): Grade {
  return GRADE_FLOORS.find(([, floor]) => points >= floor)![0];
}

/**
 * How reliably a debtor pays, recomputed from the loans and payments every
 * time (nothing is stored, so editing a loan or a payment can never leave it
 * stale). `asOf` replays the history as it stood on that day — that's how the
 * 30-day trend is measured.
 */
export class ScoreService {
  constructor(private db: Db) {}

  private points(borrowerId: string, asOf: string): { points: number; factors: ScoreFactors; hasHistory: boolean } {
    const loans = (
      this.db.prepare("SELECT * FROM loans WHERE borrower_id = ? AND status != 'cancelled'").all(borrowerId) as Loan[]
    ).filter((l) => l.disbursed_on <= asOf);
    const factors: ScoreFactors = {
      onTime: 0,
      slightlyLate: 0,
      late: 0,
      veryLate: 0,
      overdueUnpaid: 0,
      rejectedReceipts: 0,
      completedLoans: 0,
    };
    let delta = 0;
    let hasHistory = false;

    for (const loan of loans) {
      const installments = this.db
        .prepare('SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY number')
        .all(loan.id) as Installment[];
      const payments = (this.db.prepare('SELECT * FROM payments WHERE loan_id = ?').all(loan.id) as Payment[]).filter(
        (p) => p.paid_on <= asOf,
      );
      const { installments: views, summary } = allocate(loan, installments, payments, asOf);

      for (const inst of views) {
        if (inst.paid_on) {
          hasHistory = true;
          const late = daysBetween(inst.due_on, inst.paid_on);
          if (late <= 0) {
            factors.onTime++;
            delta += POINTS.onTime;
          } else if (late <= 7) {
            factors.slightlyLate++;
          } else if (late <= 30) {
            factors.late++;
            delta += POINTS.late;
          } else {
            factors.veryLate++;
            delta += POINTS.veryLate;
          }
        } else if (inst.due_on < asOf) {
          hasHistory = true;
          // Grows with every day it stays unpaid: -3 at once, -1 more per 10 days, up to -15.
          factors.overdueUnpaid++;
          delta -= Math.min(15, 3 + Math.floor(daysBetween(inst.due_on, asOf) / 10));
        }
      }

      if (summary.remainingCents === 0 && installments.length > 0) {
        factors.completedLoans++;
        delta += POINTS.completedLoan;
      }

      // Only rejections the lender made count — the AI never decides on its own.
      const rejected = payments.filter(
        (p) => p.source === 'debtor' && p.status === 'rejected' && p.reviewed_by && (p.reviewed_at ?? '').slice(0, 10) <= asOf,
      ).length;
      factors.rejectedReceipts += rejected;
      delta += rejected * POINTS.rejectedReceipt;
      if (rejected > 0) hasHistory = true;
    }

    return { points: Math.max(0, Math.min(100, START + delta)), factors, hasHistory };
  }

  forBorrower(borrowerId: string): CreditScore {
    const now = today();
    const current = this.points(borrowerId, now);
    const previous = this.points(borrowerId, addDays(now, -30));
    const grade = gradeFor(current.points);
    const better = GRADE_FLOORS[GRADE_FLOORS.findIndex(([g]) => g === grade) - 1];
    return {
      grade,
      points: current.points,
      previousPoints: previous.points,
      trend: current.points > previous.points ? 'up' : current.points < previous.points ? 'down' : 'flat',
      willDrop: current.factors.overdueUnpaid > 0,
      noHistory: !current.hasHistory,
      toNextGrade: better ? better[1] - current.points : null,
      factors: current.factors,
    };
  }

  /** Every debtor's score at once, for the User Manager cards. */
  all(): Record<string, CreditScore> {
    const ids = this.db.prepare("SELECT id FROM users WHERE role = 'user'").all() as { id: string }[];
    return Object.fromEntries(ids.map(({ id }) => [id, this.forBorrower(id)]));
  }
}
