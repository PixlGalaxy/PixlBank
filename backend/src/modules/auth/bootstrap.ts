import { randomUUID } from 'crypto';
import type { Db } from '../../db/client.js';
import type { EnvConfig } from '../../config/env.js';
import type { User } from '../../types/index.js';
import { hashPassword, verifyPassword } from './password.js';
import { EMAIL, USERNAME } from '../users/validation.js';
import { logger } from '../../logger.js';

/**
 * The lender account comes from .env (ADMIN_USERNAME / ADMIN_EMAIL /
 * ADMIN_PASSWORD) and there is only ever one of it.
 *
 * - First boot: the account is created with that password.
 * - Later boots: username and email follow .env (so renaming it there works).
 *   The password is only re-applied when ADMIN_PASSWORD itself is edited in
 *   .env; otherwise the one set from the web (Settings -> My Account) stays.
 */
export async function bootstrapAdmin(db: Db, config: EnvConfig): Promise<void> {
  const { ADMIN_USERNAME: username, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = config;
  const existing = db.prepare("SELECT * FROM users WHERE role = 'admin'").get() as User | undefined;

  if (!username || !email || (!existing && !password)) {
    if (existing) {
      logger.warn('ADMIN_USERNAME / ADMIN_EMAIL are not set in .env; keeping the existing admin account as is.');
      return;
    }
    throw new Error('ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to create the admin account.');
  }
  if (!USERNAME.test(username)) throw new Error(`ADMIN_USERNAME "${username}" must be 3-32 characters of a-z, 0-9, . _ -`);
  if (!EMAIL.test(email)) throw new Error(`ADMIN_EMAIL "${email}" is not a valid email address`);

  // A debtor already holding the name/email would make the admin unreachable.
  const clash = db
    .prepare("SELECT username FROM users WHERE role != 'admin' AND (username = ? OR email = ?)")
    .get(username, email) as { username: string } | undefined;
  if (clash) {
    throw new Error(`ADMIN_USERNAME/ADMIN_EMAIL collide with the existing user "${clash.username}"; pick different values.`);
  }

  if (!existing) {
    if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
    db.prepare(
      `INSERT INTO users (id, email, username, password_hash, display_name, role, is_active, language)
       VALUES (?, ?, ?, ?, ?, 'admin', 1, ?)`,
    ).run(randomUUID(), email, username, await hashPassword(password), config.ADMIN_DISPLAY_NAME ?? null, config.LANGUAGE);
    await rememberEnvPassword(db, password);
    logger.info(`Admin account "${username}" created from .env`);
    return;
  }

  if (existing.username !== username || existing.email !== email || existing.is_active !== 1) {
    db.prepare(
      "UPDATE users SET username = ?, email = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?",
    ).run(username, email, existing.id);
    logger.info(`Admin account synced with .env as "${username}" <${email}>`);
  }

  // A new ADMIN_PASSWORD in .env is applied once; an unchanged one never
  // overrides a password set from the web. Doubles as account recovery.
  if (password && !(await envPasswordAlreadyApplied(db, password))) {
    if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      await hashPassword(password),
      existing.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    await rememberEnvPassword(db, password);
    logger.info(`ADMIN_PASSWORD changed in .env: applied it to "${username}"`);
  }
}

/** Hash of the last ADMIN_PASSWORD taken from .env, so we can tell when it's edited. */
const ENV_PASSWORD_KEY = 'admin_env_password_hash';

async function envPasswordAlreadyApplied(db: Db, password: string): Promise<boolean> {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(ENV_PASSWORD_KEY) as { value: string } | undefined;
  return row ? verifyPassword(password, row.value) : false;
}

async function rememberEnvPassword(db: Db, password: string): Promise<void> {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(ENV_PASSWORD_KEY, await hashPassword(password));
}
