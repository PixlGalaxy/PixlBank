import { api, ApiError } from './client';
import type { User } from './types';

export type RatePeriod = 'annual' | 'monthly';
export type InterestMethod = 'french' | 'simple';
export type PaymentFrequency = 'weekly' | 'biweekly' | 'monthly';
export type LoanState = 'active' | 'overdue' | 'paid' | 'cancelled';
export type InstallmentState = 'paid' | 'partial' | 'overdue' | 'pending';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';
export type AiFlag = 'green' | 'amber' | 'red';
export type AiStatus = 'not_required' | 'pending' | 'valid' | 'invalid' | 'error' | 'disabled';
export type ReasonCode =
  | 'ok'
  | 'not_a_receipt'
  | 'no_date'
  | 'date_too_old'
  | 'date_in_future'
  | 'no_amount'
  | 'amount_mismatch'
  | 'unreachable'
  | 'bad_response'
  | 'disabled';

export interface LoanSummary {
  state: LoanState;
  totalDueCents: number;
  totalInterestCents: number;
  paidCents: number;
  remainingCents: number;
  percentPaid: number;
  interestCollectedCents: number;
  principalCollectedCents: number;
  overpaidCents: number;
  overdueCents: number;
  overdueCount: number;
  pendingReviewCount: number;
  pendingReviewCents: number;
  installmentsPaid: number;
  nextInstallment: { number: number; dueOn: string; amountDueCents: number; daysLeft: number } | null;
  lastPaymentOn: string | null;
}

export interface Installment {
  id: string;
  number: number;
  due_on: string;
  amount_cents: number;
  principal_cents: number;
  interest_cents: number;
  paid_cents: number;
  remaining_cents: number;
  state: InstallmentState;
  paid_on: string | null;
}

export interface ReceiptMetadata {
  /** When the photo/screenshot was taken, as the device wrote it ("YYYY-MM-DD HH:MM:SS[±HH:MM]"). */
  createdAt: string | null;
  /** When an app last saved the image. */
  modifiedAt: string | null;
  /** The app that wrote the file. */
  software: string | null;
  device: string | null;
  /** The file's last-modified time on the debtor's device (ISO), from the browser. */
  fileModifiedAt: string | null;
}

export interface Payment {
  id: string;
  loan_id: string;
  amount_cents: number;
  paid_on: string;
  status: PaymentStatus;
  source: 'debtor' | 'admin';
  note: string | null;
  receipt_mime: string | null;
  has_receipt: boolean;
  /** What the receipt image says about itself — admin only (null for debtors and older receipts). */
  receipt_meta: ReceiptMetadata | null;
  ai_status: AiStatus;
  ai_amount_cents: number | null;
  ai_date: string | null;
  ai_reason: ReasonCode | null;
  ai_model: string | null;
  /** 0-100, admin only (null for debtors). */
  ai_confidence: number | null;
  /** The model's own remark about the image, admin only. */
  ai_notes: string | null;
  /** The score as a color — what debtors see. */
  ai_flag: AiFlag | null;
  ai_checked_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  interest_cents: number;
  principal_cents: number;
}

export interface Loan {
  id: string;
  borrower_id: string;
  title: string;
  notes: string | null;
  currency: string;
  principal_cents: number;
  interest_rate: number;
  rate_period: RatePeriod;
  interest_method: InterestMethod;
  frequency: PaymentFrequency;
  installments_count: number;
  disbursed_on: string;
  first_due_on: string;
  status: 'active' | 'cancelled';
  /** 1: paying ahead never reduces the agreed interest. */
  prepay_keeps_interest: number;
  created_at: string;
  updated_at: string;
  borrower: Pick<User, 'id' | 'username' | 'display_name' | 'email' | 'avatar_path' | 'updated_at'>;
  summary: LoanSummary;
}

export interface LoanDetail extends Loan {
  installments: Installment[];
  payments: Payment[];
  /** The lender (admin), shown to the debtor. */
  lender: Loan['borrower'] | null;
}

export interface LoanInput {
  borrowerId: string;
  title: string;
  notes: string | null;
  currency: string;
  /** Major units, e.g. 1500.5 */
  principal: number;
  interestRate: number;
  ratePeriod: RatePeriod;
  interestMethod: InterestMethod;
  frequency: PaymentFrequency;
  installmentsCount: number;
  disbursedOn: string;
  firstDueOn: string;
  status?: 'active' | 'cancelled';
  prepayKeepsInterest: boolean;
}

export interface ScheduledInstallment {
  number: number;
  dueOn: string;
  amountCents: number;
  principalCents: number;
  interestCents: number;
}


export const loansApi = {
  mine: () => api.get<LoanDetail[]>('/loans/mine'),
  listDetailed: (borrowerId?: string) =>
    api.get<LoanDetail[]>(`/loans?detailed=1${borrowerId ? `&borrowerId=${encodeURIComponent(borrowerId)}` : ''}`),
  get: (id: string) => api.get<LoanDetail>(`/loans/${id}`),
  preview: (input: Partial<LoanInput>) => api.post<ScheduledInstallment[]>('/loans/preview', input),
  create: (input: LoanInput) => api.post<LoanDetail>('/loans', input),
  update: (id: string, input: Partial<LoanInput>) => api.patch<LoanDetail>(`/loans/${id}`, input),
  remove: (id: string) => api.del<void>(`/loans/${id}`),
  addPayment: (id: string, input: { amount: number; paidOn: string; note?: string }) =>
    api.post<LoanDetail>(`/loans/${id}/payments`, input),
  remind: (id: string) => api.post<{ success: true }>(`/loans/${id}/remind`),
};

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface CreditScore {
  grade: Grade;
  points: number;
  previousPoints: number;
  trend: 'up' | 'down' | 'flat';
  willDrop: boolean;
  noHistory: boolean;
  toNextGrade: number | null;
  factors: {
    onTime: number;
    slightlyLate: number;
    late: number;
    veryLate: number;
    overdueUnpaid: number;
    rejectedReceipts: number;
    completedLoans: number;
  };
}

export const scoreApi = {
  /** null when the account has no loans (only investments, or nothing yet). */
  mine: () => api.get<CreditScore | null>('/loans/score/me'),
  forUser: (userId: string) => api.get<CreditScore | null>(`/loans/score/${userId}`),
  all: () => api.get<Record<string, CreditScore>>('/loans/scores'),
};

export const paymentsApi = {
  receiptUrl: (id: string) => `/backend/api/payments/${id}/receipt`,

  /** Multipart: the receipt image travels with the form fields. */
  report: async (input: { loanId: string; amount: number; paidOn: string; note?: string; receipt: File }) => {
    const form = new FormData();
    form.append('loanId', input.loanId);
    form.append('amount', String(input.amount));
    form.append('paidOn', input.paidOn);
    if (input.note) form.append('note', input.note);
    // Browsers only expose a file's last-modified time, never its creation date.
    form.append('fileModified', String(input.receipt.lastModified));
    form.append('receipt', input.receipt);
    const res = await fetch('/backend/api/payments/report', { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? 'Upload failed');
    }
    return (await res.json()) as { paymentId: string };
  },

  review: (id: string, decision: 'approved' | 'rejected', note?: string) =>
    api.post<Payment>(`/payments/${id}/review`, { decision, note }),
  /** Queues a fresh AI check; the result appears on the payment when the model is done. */
  verify: (id: string) => api.post<{ success: true }>(`/payments/${id}/verify`),
  remove: (id: string) => api.del<void>(`/payments/${id}`),
};
