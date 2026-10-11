import { randomUUID } from 'crypto';
import type { Db } from '../../db/client.js';
import type { User, PublicUser } from '../../types/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { hashPassword } from '../auth/password.js';
import { toPublicUser } from '../auth/auth.service.js';
import type { MetricsService } from '../admin/metrics.service.js';
import { EMAIL, PASSWORD_MAX, USERNAME, assertUniqueUser } from './validation.js';

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  displayName?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string | null;
  phone?: string | null;
  notes?: string | null;
  isActive?: boolean;
  password?: string;
}

function assertOptionalText(value: unknown, max: number): void {
  if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > max)) {
    throw badRequest('error.invalidInput');
  }
}

function assertOptionalFields(input: { displayName?: unknown; phone?: unknown; notes?: unknown }): void {
  assertOptionalText(input.displayName, 100);
  assertOptionalText(input.phone, 40);
  assertOptionalText(input.notes, 2000);
}

/** Empty strings become NULL so "cleared" and "never set" look the same. */
const blankToNull = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);

/**
 * Debtor accounts. The admin (lender) is never created or edited here — it
 * comes from .env, see bootstrap.ts — so every account this creates is a
 * plain 'user'.
 */
export class UsersService {
  constructor(private db: Db, private metrics: MetricsService) {}

  list(): PublicUser[] {
    const rows = this.db.prepare("SELECT * FROM users ORDER BY role = 'admin' DESC, username").all() as User[];
    return rows.map(toPublicUser);
  }

  get(id: string): PublicUser {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!row) throw notFound();
    return toPublicUser(row);
  }

  async create(input: CreateUserInput, language: string): Promise<PublicUser> {
    // Shape first, so a missing or mistyped field is a 400 rather than a crash.
    if (typeof input.email !== 'string' || !EMAIL.test(input.email)) throw badRequest('users.invalidEmail');
    if (typeof input.username !== 'string' || !USERNAME.test(input.username)) throw badRequest('users.invalidUsername');
    if (typeof input.password !== 'string' || input.password.length < 8) throw badRequest('auth.passwordTooShort');
    if (input.password.length > PASSWORD_MAX) throw badRequest('auth.passwordTooLong');
    assertOptionalFields(input);

    assertUniqueUser(this.db, 'email', input.email);
    assertUniqueUser(this.db, 'username', input.username);

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, phone, notes, role, is_active, language)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 1, ?)`,
      )
      .run(
        id,
        input.email,
        input.username,
        await hashPassword(input.password),
        blankToNull(input.displayName) ?? null,
        blankToNull(input.phone) ?? null,
        blankToNull(input.notes) ?? null,
        language,
      );

    return this.get(id);
  }

  async update(id: string, input: UpdateUserInput): Promise<PublicUser> {
    const existing = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!existing) throw notFound();
    // The lender's identity lives in .env and its password in Settings -> My Account.
    if (existing.role === 'admin') throw forbidden('users.cannotEditAdmin');

    if (input.email !== undefined) {
      if (typeof input.email !== 'string' || !EMAIL.test(input.email)) throw badRequest('users.invalidEmail');
      assertUniqueUser(this.db, 'email', input.email, id);
    }
    if (input.password !== undefined && (typeof input.password !== 'string' || input.password.length < 8)) {
      throw badRequest('auth.passwordTooShort');
    }
    if (typeof input.password === 'string' && input.password.length > PASSWORD_MAX) throw badRequest('auth.passwordTooLong');
    if (input.isActive !== undefined && typeof input.isActive !== 'boolean') throw badRequest('error.invalidInput');
    assertOptionalFields(input);

    const set = (field: keyof UpdateUserInput) => (input[field] !== undefined ? 1 : 0);
    this.db
      .prepare(
        `UPDATE users SET
           email = COALESCE(?, email),
           display_name = CASE WHEN ? THEN ? ELSE display_name END,
           phone = CASE WHEN ? THEN ? ELSE phone END,
           notes = CASE WHEN ? THEN ? ELSE notes END,
           is_active = COALESCE(?, is_active),
           password_hash = COALESCE(?, password_hash),
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.email ?? null,
        set('displayName'),
        blankToNull(input.displayName) ?? null,
        set('phone'),
        blankToNull(input.phone) ?? null,
        set('notes'),
        blankToNull(input.notes) ?? null,
        input.isActive === undefined ? null : input.isActive ? 1 : 0,
        input.password ? await hashPassword(input.password) : null,
        id,
      );

    // A deactivated user or a new password must stop old sessions.
    if (input.isActive === false || input.password) {
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.metrics.forgetUser(existing.username);
    }

    return this.get(id);
  }

  remove(id: string, actingUserId: string): void {
    if (id === actingUserId) throw badRequest('users.cannotDeleteSelf');
    const existing = this.db.prepare('SELECT username, role FROM users WHERE id = ?').get(id) as
      | { username: string; role: string }
      | undefined;
    if (!existing) throw notFound();
    if (existing.role === 'admin') throw forbidden('users.cannotEditAdmin');
    // Deleting would silently wipe the loan history with it; deactivate instead.
    const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM loans WHERE borrower_id = ?').get(id) as {
      count: number;
    };
    if (count > 0) throw conflict('users.hasLoans');

    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    this.metrics.forgetUser(existing.username);
  }
}
