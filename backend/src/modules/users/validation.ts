import type { Db } from '../../db/client.js';
import { conflict } from '../../errors.js';

// Intentionally permissive: self-hosted installs use intranet addresses such as
// "admin@localhost", which a TLD-requiring pattern would reject.
export const EMAIL = /^[^\s@]+@[^\s@]+$/;
export const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;
/** Emails are compared and stored lowercase, so "Tomas@x.com" and "tomas@x.com" are one account. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
/** Hashing is deliberately expensive, so an absurdly long "password" is refused before argon2 ever sees it. */
export const PASSWORD_MAX = 256;

/** Shared by admin user management and the first-run "complete setup" flow. */
export function assertUniqueUser(db: Db, field: 'email' | 'username', value: string, exceptId?: string): void {
  const column = field === 'email' ? 'lower(email)' : 'username';
  const lookup = field === 'email' ? normalizeEmail(value) : value;
  const row = db.prepare(`SELECT id FROM users WHERE ${column} = ? AND id IS NOT ?`).get(lookup, exceptId ?? null) as
    | { id: string }
    | undefined;
  if (row) throw conflict(field === 'email' ? 'users.emailTaken' : 'users.usernameTaken');
}
