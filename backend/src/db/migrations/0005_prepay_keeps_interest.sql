-- 1: paying ahead only brings the principal forward — the interest agreed in
-- the original plan is still owed in full. 0: it re-amortizes, so paying ahead
-- also saves interest. See allocate() in loans.service.ts.
ALTER TABLE loans ADD COLUMN prepay_keeps_interest INTEGER NOT NULL DEFAULT 1;
