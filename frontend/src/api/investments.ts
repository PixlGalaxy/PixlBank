import { api } from './client';
import type { RatePeriod } from './loans';
import type { User } from './types';

export type AccrualStart = 'same_day' | 'month_end';

export interface InvestmentMovement {
  id: string;
  movedOn: string;
  /** Positive: contribution. Negative: withdrawal. */
  amountCents: number;
  accrual: AccrualStart;
  note: string | null;
}

/** One month of the statement — a row of the spreadsheet. */
export interface InvestmentPeriod {
  from: string;
  to: string;
  days: number;
  openingCents: number;
  interestCents: number;
  movementCents: number;
  closingCents: number;
  /** Still in the future: what it's expected to be. */
  projected: boolean;
}

export interface InvestmentSummary {
  contributedCents: number;
  withdrawnCents: number;
  valueTodayCents: number;
  interestToDateCents: number;
  horizonOn: string;
  valueAtHorizonCents: number;
  interestAtHorizonCents: number;
}

export interface Investment {
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
  owner: Pick<User, 'id' | 'username' | 'display_name' | 'email' | 'avatar_path' | 'updated_at' | 'is_active'>;
  movements: InvestmentMovement[];
  statement: InvestmentPeriod[];
  summary: InvestmentSummary;
}

export interface InvestmentInput {
  ownerId: string;
  title: string;
  notes: string | null;
  currency: string;
  principal: number;
  interestRate: number;
  ratePeriod: RatePeriod;
  startOn: string;
  endOn: string | null;
}

export interface MovementInput {
  movedOn: string;
  amount: number;
  kind: 'contribution' | 'withdrawal';
  accrual: AccrualStart;
  note?: string;
}

export const investmentsApi = {
  list: (ownerId?: string) => api.get<Investment[]>(`/investments${ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : ''}`),
  mine: () => api.get<Investment[]>('/investments/mine'),
  /** `horizon`: project up to that date (capped at the end date, unless `ignoreEnd`). */
  get: (id: string, horizon?: string, ignoreEnd = false) => {
    const query = new URLSearchParams();
    if (horizon) query.set('horizon', horizon);
    if (ignoreEnd) query.set('ignoreEnd', '1');
    const qs = query.toString();
    return api.get<Investment>(`/investments/${id}${qs ? `?${qs}` : ''}`);
  },
  create: (input: InvestmentInput) => api.post<Investment>('/investments', input),
  update: (id: string, input: Partial<InvestmentInput>) => api.patch<Investment>(`/investments/${id}`, input),
  remove: (id: string) => api.del<void>(`/investments/${id}`),
  addMovement: (id: string, input: MovementInput) => api.post<Investment>(`/investments/${id}/movements`, input),
  removeMovement: (id: string, movementId: string) => api.del<Investment>(`/investments/${id}/movements/${movementId}`),
};
