import { randomUUID } from 'crypto';
import { connect } from 'net';
import nodemailer from 'nodemailer';
import type { Db } from '../../db/client.js';
import type { EnvConfig } from '../../config/env.js';
import type { SettingsService } from '../../db/settings.js';
import { SUPPORTED_LANGUAGES, isLanguage, type EmailTranslate } from '../../i18n/index.js';
import { SETTINGS_KEYS } from '../admin/settings-keys.js';
import { logger } from '../../logger.js';
import {
  EMAIL_KINDS,
  SAMPLE_VARS,
  defaultTemplate,
  parseTemplate,
  renderEmail,
  type EmailKind,
  type EmailTemplate,
} from './templates.js';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /** Skip certificate checks — for a self-signed mail server on the local network. */
  allowSelfSigned: boolean;
}

/** Where the SMTP settings in use come from. */
export type SmtpSource = 'saved' | 'env' | 'none';

export interface SmtpStatus {
  configured: boolean;
  host: string;
  port: number;
  /** A TCP connection to host:port opened. */
  reachable: boolean;
  /** How long opening it took. */
  pingMs: number | null;
  /** 'none' when there's no username to sign in with. */
  auth: 'ok' | 'failed' | 'none' | 'skipped';
  error: string | null;
  checkedAt: string;
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
  recipient_name: string | null;
  language: string | null;
  is_test: number;
  created_at: string;
}

interface LogMeta {
  name?: string | null;
  language?: string | null;
  isTest?: boolean;
}

const SMTP_KEYS = [
  SETTINGS_KEYS.smtpEnabled,
  SETTINGS_KEYS.smtpHost,
  SETTINGS_KEYS.smtpPort,
  SETTINGS_KEYS.smtpSecure,
  SETTINGS_KEYS.smtpUser,
  SETTINGS_KEYS.smtpPassword,
  SETTINGS_KEYS.smtpFrom,
  SETTINGS_KEYS.smtpAllowSelfSigned,
];

const templateKey = (kind: EmailKind, language: string) => `email_template:${kind}:${language}`;

/**
 * Outgoing email. The SMTP configuration lives in app_settings (Admin Panel ->
 * Email), with the .env SMTP_* values as first-boot defaults, and is re-read
 * on every send so edits apply immediately. Each kind of email has a template
 * per language the lender can edit; the locale files hold the defaults. Every
 * attempt is recorded in `email_log`, including the ones skipped because SMTP is off.
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
      allowSelfSigned: s.getBoolean(SETTINGS_KEYS.smtpAllowSelfSigned, false),
    };
  }

  source(): SmtpSource {
    if (SMTP_KEYS.some((key) => this.settings.has(key))) return 'saved';
    return this.config.SMTP_HOST ? 'env' : 'none';
  }

  /** "Remove saved settings": back to the .env values, or to no email at all. */
  clearSaved(): void {
    for (const key of SMTP_KEYS) this.settings.delete(key);
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

  private log(to: string, subject: string, kind: string, status: EmailLogRow['status'], meta: LogMeta, error?: string): void {
    this.db
      .prepare(
        `INSERT INTO email_log (id, to_address, subject, kind, status, error, recipient_name, language, is_test)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), to, subject, kind, status, error ?? null, meta.name ?? null, meta.language ?? null, meta.isTest ? 1 : 0);
    // Keeps the table from growing forever on a long-lived install.
    this.db
      .prepare('DELETE FROM email_log WHERE id NOT IN (SELECT id FROM email_log ORDER BY created_at DESC LIMIT 500)')
      .run();
  }

  private transport(c: SmtpConfig) {
    return nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.password } : undefined,
      // Still encrypted — only the certificate's issuer and name go unchecked.
      tls: c.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
  }

  /** Opens a TCP connection, then signs in — never sends anything. */
  async check(): Promise<SmtpStatus> {
    const c = this.getConfig();
    const status: SmtpStatus = {
      configured: this.isConfigured(),
      host: c.host,
      port: c.port,
      reachable: false,
      pingMs: null,
      auth: 'skipped',
      error: null,
      checkedAt: new Date().toISOString(),
    };
    if (!c.host) return status;

    const started = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host: c.host, port: c.port });
        socket.setTimeout(5000);
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('timeout', () => {
          socket.destroy();
          reject(new Error(`No answer from ${c.host}:${c.port} after 5 s`));
        });
        socket.once('error', reject);
      });
      status.reachable = true;
      status.pingMs = Date.now() - started;
    } catch (err) {
      status.error = err instanceof Error ? err.message : String(err);
      return status;
    }

    if (!c.user) {
      status.auth = 'none';
      return status;
    }
    try {
      await this.transport(c).verify();
      status.auth = 'ok';
    } catch (err) {
      status.auth = 'failed';
      status.error = err instanceof Error ? err.message : String(err);
    }
    return status;
  }

  // ---- Templates ----

  getTemplate(kind: EmailKind, language: string): EmailTemplate {
    const lang = isLanguage(language) ? language : 'en';
    const stored = this.settings.getOptionalString(templateKey(kind, lang));
    if (stored) {
      try {
        const parsed = parseTemplate(JSON.parse(stored));
        if (parsed) return parsed;
      } catch {
        // A broken row falls back to the default rather than breaking every email of that kind.
      }
    }
    return defaultTemplate(this.te, kind, lang);
  }

  /** Every kind × language, flagged where the lender changed the default. */
  allTemplates() {
    return EMAIL_KINDS.map((kind) => ({
      kind,
      vars: ['app', 'name', ...Object.keys(SAMPLE_VARS[kind])],
      languages: Object.fromEntries(
        SUPPORTED_LANGUAGES.map((lang) => [
          lang,
          {
            ...this.getTemplate(kind, lang),
            customized: this.settings.has(templateKey(kind, lang)),
            defaults: defaultTemplate(this.te, kind, lang),
          },
        ]),
      ),
    }));
  }

  /** Saves a template; one identical to the default is stored as "not customized". */
  saveTemplate(kind: EmailKind, language: string, template: EmailTemplate): void {
    const fallback = defaultTemplate(this.te, kind, language);
    const same = (Object.keys(fallback) as (keyof EmailTemplate)[]).every((f) => fallback[f] === template[f]);
    if (same) this.settings.delete(templateKey(kind, language));
    else this.settings.set(templateKey(kind, language), JSON.stringify(template));
  }

  resetTemplates(): void {
    for (const kind of EMAIL_KINDS) for (const lang of SUPPORTED_LANGUAGES) this.settings.delete(templateKey(kind, lang));
  }

  /** The sample values shown in previews and test emails, with the reason line in the right language. */
  sampleVars(kind: EmailKind, language: string, name: string): Record<string, string> {
    const vars: Record<string, string> = { app: this.appName(), name, ...SAMPLE_VARS[kind] };
    if (kind === 'payment-rejected') vars.reason = this.te(language, 'receipt.reason.manual');
    if (kind === 'admin-payment-review') vars.reason = this.te(language, 'receipt.reason.ok');
    if (kind === 'admin-receipt-suspicious') {
      vars.reason = this.te(language, 'receipt.reason.amount_mismatch', { detected: 'S/ 104.00' });
    }
    return vars;
  }

  preview(kind: EmailKind, language: string, template: EmailTemplate, name: string) {
    const vars = this.sampleVars(kind, language, name);
    return renderEmail(template, vars, this.appName(), this.appUrl() || 'https://pixlbank.example');
  }

  // ---- Sending ----

  /** Throws on failure, so a test button can show the SMTP server's own message. */
  private async deliver(
    to: string,
    rendered: { subject: string; text: string; html: string },
    kind: string,
    meta: LogMeta,
  ): Promise<void> {
    const c = this.getConfig();
    if (!this.isConfigured()) {
      this.log(to, rendered.subject, kind, 'skipped', meta, 'SMTP is not configured');
      throw new Error('SMTP is not configured');
    }
    try {
      await this.transport(c).sendMail({ from: c.from || c.user, to, ...rendered });
      this.log(to, rendered.subject, kind, 'sent', meta);
      logger.info(`Email "${kind}" sent to ${to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(to, rendered.subject, kind, 'failed', meta, message);
      logger.warn(`Email "${kind}" to ${to} failed: ${message}`);
      throw err;
    }
  }

  /**
   * Fire-and-forget send from the kind's template: never throws, so a mail
   * outage can't break the action that triggered it (a payment report, a review...).
   */
  async send(to: Recipient, kind: EmailKind, vars: Record<string, string | number>): Promise<boolean> {
    if (!to.email) return false;
    const rendered = renderEmail(
      this.getTemplate(kind, to.language),
      { app: this.appName(), name: to.name, ...vars },
      this.appName(),
      this.appUrl(),
    );
    try {
      await this.deliver(to.email, rendered, kind, { name: to.name, language: to.language });
      return true;
    } catch {
      return false;
    }
  }

  /** A sample of one kind (marked [TEST]) from the Admin Panel. Throws with the SMTP error. */
  async sendSample(kind: EmailKind, to: string, language: string, name: string): Promise<void> {
    const lang = isLanguage(language) ? language : 'en';
    const vars = this.sampleVars(kind, lang, name);
    const rendered = renderEmail(this.getTemplate(kind, lang), vars, this.appName(), this.appUrl());
    if (kind !== 'test') rendered.subject = `[TEST] ${rendered.subject}`;
    await this.deliver(to, rendered, kind, { name, language: lang, isTest: true });
  }
}
