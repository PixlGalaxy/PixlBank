-- The installment number a payment is meant to cover up to (inclusive). NULL:
-- it covers whatever its date's period is, and anything beyond that is a
-- prepayment. Set it to pay an upcoming installment early — e.g. December's
-- installment handed over in cash in November — so it's settled instead of
-- spread over the rest of the plan. See allocate() in loans.service.ts.
ALTER TABLE payments ADD COLUMN covers_through INTEGER;
