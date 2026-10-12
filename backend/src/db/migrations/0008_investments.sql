-- Investments: money placed with an account (often a company with no login)
-- whose interest is reinvested — credited to the balance at every month end —
-- instead of being paid back in installments like a loan.
CREATE TABLE investments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  currency TEXT NOT NULL,
  principal_cents INTEGER NOT NULL CHECK (principal_cents > 0),
  -- Effective rate in percent, per year or per month (360-day year, as Peruvian banks quote it).
  interest_rate REAL NOT NULL CHECK (interest_rate >= 0),
  rate_period TEXT NOT NULL CHECK (rate_period IN ('annual', 'monthly')),
  start_on TEXT NOT NULL,
  -- NULL: open-ended.
  end_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_investments_owner ON investments(owner_id);

-- Contributions (positive) and withdrawals (negative) after the start.
CREATE TABLE investment_movements (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  moved_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
  -- 'same_day': earns (or stops earning) interest from its own date; 'month_end': from the close of its month.
  accrual TEXT NOT NULL CHECK (accrual IN ('same_day', 'month_end')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_investment_movements ON investment_movements(investment_id, moved_on);
