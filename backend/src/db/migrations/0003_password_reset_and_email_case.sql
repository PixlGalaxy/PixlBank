-- Set when the lender creates the account or sets its password: the debtor
-- must pick their own on the next sign-in. Cleared by a password change.
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
-- Emails are stored lowercase from now on. An address that would collide with
-- another account once lowercased is left as is (login matches it either way).
UPDATE users SET email = lower(trim(email))
  WHERE NOT EXISTS (
    SELECT 1 FROM users other WHERE other.id != users.id AND lower(trim(other.email)) = lower(trim(users.email))
  );
