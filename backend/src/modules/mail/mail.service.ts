import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import type { Db } from '../../db/client.js';
import type { EnvConfig } from '../../config/env.js';
import type { SettingsService } from '../../db/settings.js';
import type { EmailKey, EmailTranslate } from '../../i18n/index.js';
import { SETTINGS_KEYS } from '../admin/settings-keys.js';
import { logger } from '../../logger.js';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface Recipient {
  email: string;
  name: string;
  language: string;
}

interface EmailLogRow {
  id: string;
  to_address: string;
  subject: string;
  kind: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Outgoing email. The SMTP configuration lives in app_settings (Admin Panel ->
 * Settings -> Email), with the .env SMTP_* values as first-boot defaults, and
 * is re-read on every send so edits apply immediately. Every attempt is
 * recorded in `email_log`, including the ones skipped because SMTP is off.
 */
export class MailService {
  constructor(
    private db: Db,
    private settings: SettingsService,
    private config: EnvConfig,
    private te: EmailTranslate,
  ) {}

  getConfig(): SmtpConfig {
    const s = this.settings;
    const host = s.getString(SETTINGS_KEYS.smtpHost, this.config.SMTP_HOST ?? '');
    return {
      enabled: s.getBoolean(SETTINGS_KEYS.smtpEnabled, Boolean(this.config.SMTP_HOST)),
      host,
      port: s.getNumber(SETTINGS_KEYS.smtpPort, this.config.SMTP_PORT),
      secure: s.getBoolean(SETTINGS_KEYS.smtpSecure, this.config.SMTP_SECURE),
      user: s.getString(SETTINGS_KEYS.smtpUser, this.config.SMTP_USER ?? ''),
      password: s.getString(SETTINGS_KEYS.smtpPassword, this.config.SMTP_PASSWORD ?? ''),
      from: s.getString(SETTINGS_KEYS.smtpFrom, this.config.SMTP_FROM ?? ''),
    };
  }

  isConfigured(): boolean {
    const c = this.getConfig();
    return c.enabled && Boolean(c.host) && Boolean(c.from || c.user);
  }

  appUrl(): string {
    return this.settings.getString(SETTINGS_KEYS.appUrl, this.config.APP_URL ?? '');
  }

  appName(): string {
    return this.settings.getString(SETTINGS_KEYS.appName, this.config.APP_NAME);
  }

  recentLog(limit = 50): EmailLogRow[] {
    return this.db.prepare('SELECT * FROM email_log ORDER BY created_at DESC LIMIT ?').all(limit) as EmailLogRow[];
  }

  private log(to: string, subject: string, kind: string, status: EmailLogRow['status'], error?: string): void {
    this.db
      .prepare('INSERT INTO email_log (id, to_address, subject, kind, status, error) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), to, subject, kind, status, error ?? null);
    // Keeps the table from growing forever on a long-lived install.
    this.db
      .prepare('DELETE FROM email_log WHERE id NOT IN (SELECT id FROM email_log ORDER BY created_at DESC LIMIT 500)')
      .run();
  }

  /** Lays out a plain message as text + a minimal HTML version. */
  private render(language: string, name: string, body: string): { text: string; html: string } {
    const appName = this.appName();
    const url = this.appUrl();
    const greeting = this.te(language, 'email.greeting', { name });
    const footer = this.te(language, 'email.footer', { app: appName });
    const open = url ? this.te(language, 'email.openApp', { app: appName }) : '';

    const text = [greeting, '', body, '', url ? `${open}: ${url}` : '', '', footer].filter((l, i, a) => l || a[i - 1]).join('\n');
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
<div style="padding:18px 24px;background:#4f46e5;color:#ffffff;font-size:18px;font-weight:600">${escapeHtml(appName)}</div>
<div style="padding:24px;font-size:15px;line-height:1.6">
<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
${body
  .split('\n')
  .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line) || '&nbsp;'}</p>`)
  .join('\n')}
${url ? `<p style="margin:22px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(open)}</a></p>` : ''}
</div>
<div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${escapeHtml(footer)}</div>
</div></body></html>`;
    return { text, html };
  }

  /** Throws on failure — used by the "send test email" button so the admin sees the SMTP error. */
  async sendRaw(to: string, subject: string, text: string, html: string, kind: string): Promise<void> {
    const c = this.getConfig();
    if (!this.isConfigured()) {
      this.log(to, subject, kind, 'skipped', 'SMTP is not configured');
      throw new Error('SMTP is not configured');
    }
    const transport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.password } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
    try {
      await transport.sendMail({ from: c.from || c.user, to, subject, text, html });
      this.log(to, subject, kind, 'sent');
      logger.info(`Email "${kind}" sent to ${to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(to, subject, kind, 'failed', message);
      logger.warn(`Email "${kind}" to ${to} failed: ${message}`);
      throw err;
    }
  }

  /**
   * Fire-and-forget template send: never throws, so a mail outage can't break
   * the action that triggered it (a payment report, a review...).
   */
  async send(
    to: Recipient,
    kind: string,
    subjectKey: EmailKey,
    bodyKey: EmailKey,
    vars: Record<string, string | number>,
  ): Promise<boolean> {
    const allVars = { app: this.appName(), name: to.name, ...vars };
    const subject = this.te(to.language, subjectKey, allVars);
    const body = this.te(to.language, bodyKey, allVars);
    if (!to.email) return false;
    if (!this.isConfigured()) {
      this.log(to.email, subject, kind, 'skipped', 'SMTP is not configured');
      return false;
    }
    const { text, html } = this.render(to.language, to.name, body);
    try {
      await this.sendRaw(to.email, subject, text, html, kind);
      return true;
    } catch {
      return false;
    }
  }

  async sendTest(to: string, language: string, name: string): Promise<void> {
    const vars = { app: this.appName(), name };
    const subject = this.te(language, 'email.test.subject', vars);
    const { text, html } = this.render(language, name, this.te(language, 'email.test.body', vars));
    await this.sendRaw(to, subject, text, html, 'test');
  }
}
