-- Accounts. Exactly one 'admin' (the lender, seeded from .env); everyone else
-- is a 'user' (a debtor) created by the admin.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_path TEXT,
  phone TEXT,
  notes TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','user')) DEFAULT 'user',
  is_active INTEGER NOT NULL DEFAULT 1,
  theme_mode TEXT NOT NULL DEFAULT 'dark' CHECK (theme_mode IN ('light', 'dark', 'system')),
  -- Valid skins are enforced in code (isThemeSkin), so new ones never need a migration.
  theme_skin TEXT NOT NULL DEFAULT 'default',
  language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Only ever one lender.
CREATE UNIQUE INDEX idx_users_single_admin ON users(role) WHERE role = 'admin';

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  -- 'password' while the account still uses the default password — see requireAuth.
  pending_action TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Small key/value store: secrets and admin-editable settings.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Permanently blocked IPs, managed from the Admin Panel's IP Access page.
CREATE TABLE ip_bans (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Money is stored as integer cents (minor units) everywhere to avoid float drift.
CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  borrower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  currency TEXT NOT NULL,
  principal_cents INTEGER NOT NULL CHECK (principal_cents > 0),
  -- Percentage, e.g. 24 for 24%.
  interest_rate REAL NOT NULL CHECK (interest_rate >= 0),
  rate_period TEXT NOT NULL CHECK (rate_period IN ('annual', 'monthly')),
  interest_method TEXT NOT NULL CHECK (interest_method IN ('french', 'simple')),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  installments_count INTEGER NOT NULL CHECK (installments_count > 0),
  -- Date the money was handed over (YYYY-MM-DD).
  disbursed_on TEXT NOT NULL,
  -- Due date of the first installment (YYYY-MM-DD); the rest follow `frequency`.
  first_due_on TEXT NOT NULL,
  -- 'paid' is never stored: it is derived from the payments.
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_loans_borrower ON loans(borrower_id);

-- Amortization schedule, regenerated whenever the loan's terms change.
CREATE TABLE loan_installments (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  due_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  principal_cents INTEGER NOT NULL,
  interest_cents INTEGER NOT NULL,
  UNIQUE (loan_id, number)
);
CREATE INDEX idx_installments_due ON loan_installments(due_on);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_on TEXT NOT NULL,
  -- Only 'approved' payments count towards the balance.
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  -- 'debtor' = reported with a receipt; 'admin' = registered by the lender by hand.
  source TEXT NOT NULL CHECK (source IN ('debtor', 'admin')),
  note TEXT,
  receipt_file TEXT,
  receipt_mime TEXT,
  -- Ollama verification of the receipt.
  ai_status TEXT NOT NULL CHECK (ai_status IN ('not_required', 'pending', 'valid', 'invalid', 'error', 'disabled')),
  ai_amount_cents INTEGER,
  ai_date TEXT,
  ai_reason TEXT,
  ai_raw TEXT,
  ai_model TEXT,
  ai_checked_at TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_note TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_loan ON payments(loan_id);
CREATE INDEX idx_payments_status ON payments(status);

-- One row per reminder email sent, so the daily job never sends the same one twice.
CREATE TABLE reminders_sent (
  installment_id TEXT NOT NULL REFERENCES loan_installments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('upcoming', 'due', 'overdue')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (installment_id, kind)
);

-- Outgoing email log, shown in Admin Panel -> Settings -> Email.
CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
