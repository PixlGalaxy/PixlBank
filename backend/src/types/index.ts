/** A real light/dark switch. 'system' follows the visitor's OS preference. */
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Just the accent color family — works under either mode. */
export const THEME_SKINS = [
  'default',
  'ocean',
  'sunset',
  'forest',
  'grape',
  'crimson',
  'solar',
  'arctic',
  'mint',
  'blossom',
  'ares',
  'poseidon',
  'zeus',
  'jade',
  'verdigris',
  'nebula',
  'sakura',
  'slate',
  'mono',
  'graphite',
  'ash',
  'terracotta',
  'olive',
  'maroon',
] as const;
export type ThemeSkin = (typeof THEME_SKINS)[number];

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  avatar_path: string | null;
  phone: string | null;
  notes: string | null;
  role: 'admin' | 'user';
  is_active: number;
  theme_mode: ThemeMode;
  theme_skin: ThemeSkin;
  /** UI language, e.g. 'en' or 'es' — see SUPPORTED_LANGUAGES in i18n/index.ts. */
  language: string;
  /** 1 while the account still has a password the lender set for it — see AuthService.login. */
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

export type PublicUser = Omit<User, 'password_hash'>;

/** What a session must do before it may use the rest of the API — see requireAuth. */
export type PendingAction = 'password';

export interface Session {
  id: string;
  user_id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  pending_action: PendingAction | null;
}

export type RatePeriod = 'annual' | 'monthly';
export type InterestMethod = 'french' | 'simple';
export type PaymentFrequency = 'weekly' | 'biweekly' | 'monthly';

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
  created_at: string;
  updated_at: string;
}

export interface Installment {
  id: string;
  loan_id: string;
  number: number;
  due_on: string;
  amount_cents: number;
  principal_cents: number;
  interest_cents: number;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected';
export type AiStatus = 'not_required' | 'pending' | 'valid' | 'invalid' | 'error' | 'disabled';

export interface Payment {
  id: string;
  loan_id: string;
  amount_cents: number;
  paid_on: string;
  status: PaymentStatus;
  source: 'debtor' | 'admin';
  note: string | null;
  receipt_file: string | null;
  receipt_mime: string | null;
  /** JSON ReceiptMetadata read off the image at upload (payments/image-metadata.ts). */
  receipt_meta: string | null;
  ai_status: AiStatus;
  ai_amount_cents: number | null;
  ai_date: string | null;
  ai_reason: string | null;
  ai_raw: string | null;
  ai_model: string | null;
  /** 0-100: how trustworthy the receipt looks to the vision model, after the date/amount checks. */
  ai_confidence: number | null;
  ai_notes: string | null;
  ai_checked_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_by: string | null;
  created_at: string;
}
