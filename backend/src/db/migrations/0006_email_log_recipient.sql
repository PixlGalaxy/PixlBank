-- Who each email went to and in which language, and whether it was a test
-- sent from the Admin Panel — the columns of the "Recent emails" table.
ALTER TABLE email_log ADD COLUMN recipient_name TEXT;
ALTER TABLE email_log ADD COLUMN language TEXT;
ALTER TABLE email_log ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
UPDATE email_log SET is_test = 1 WHERE kind = 'test';
