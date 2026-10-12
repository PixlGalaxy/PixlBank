/**
 * `app_settings` row keys for admin-editable configuration. Centralized here so
 * `index.ts` (the startup overlay), `admin.routes.ts` (the settings API) and
 * `app.ts` (the live-tier reads in `/api/config`) all agree on the same names.
 */
export const SETTINGS_KEYS = {
  // Restart-tier: baked into closures/constructors at boot, so an admin edit
  // only takes effect after `POST /api/admin/services/backend/restart`.
  sessionTtlHours: 'session_ttl_hours',
  cookieSecure: 'cookie_secure',
  loginRateLimitMax: 'login_rate_limit_max',
  loginRateLimitWindowMinutes: 'login_rate_limit_window_minutes',
  receiptRateLimitMax: 'receipt_rate_limit_max',
  receiptRateLimitWindowMinutes: 'receipt_rate_limit_window_minutes',
  maxmindLicenseKey: 'maxmind_license_key',
  trustProxy: 'trust_proxy',

  // Live-tier: read fresh on every request, no restart needed.
  appTitle: 'app_title',
  appName: 'app_name',
  defaultThemeMode: 'default_theme_mode',
  defaultThemeSkin: 'default_theme_skin',
  /** Language shown on signed-out screens (login) and new accounts' initial language. */
  defaultLanguage: 'default_language',

  // Email (SMTP)
  smtpEnabled: 'smtp_enabled',
  smtpHost: 'smtp_host',
  smtpPort: 'smtp_port',
  smtpSecure: 'smtp_secure',
  smtpUser: 'smtp_user',
  smtpPassword: 'smtp_password',
  smtpFrom: 'smtp_from',
  /** Accept a self-signed certificate (a mail server of your own on the LAN). */
  smtpAllowSelfSigned: 'smtp_allow_self_signed',
  /** Public URL used for links inside emails. */
  appUrl: 'app_url',

  // Reminders
  remindersEnabled: 'reminders_enabled',
  /** Days before a due date to send the "upcoming" reminder. */
  reminderDaysBefore: 'reminder_days_before',
  /** Local hour (0-23) from which the daily reminder run may start. */
  reminderHour: 'reminder_hour',
  /** YYYY-MM-DD of the last completed daily run. */
  remindersLastRun: 'reminders_last_run',

  // Receipt verification (Ollama)
  ollamaEnabled: 'ollama_enabled',
  ollamaUrl: 'ollama_url',
  ollamaModel: 'ollama_model',
  ollamaTimeoutSeconds: 'ollama_timeout_seconds',
  /** A receipt dated more than this many days ago is rejected. */
  receiptMaxAgeDays: 'receipt_max_age_days',
  /** Allowed difference between the declared and detected amount, in percent. */
  receiptAmountTolerance: 'receipt_amount_tolerance',
} as const;

export const RESTART_TIER_KEYS = [
  SETTINGS_KEYS.sessionTtlHours,
  SETTINGS_KEYS.cookieSecure,
  SETTINGS_KEYS.loginRateLimitMax,
  SETTINGS_KEYS.loginRateLimitWindowMinutes,
  SETTINGS_KEYS.receiptRateLimitMax,
  SETTINGS_KEYS.receiptRateLimitWindowMinutes,
  SETTINGS_KEYS.maxmindLicenseKey,
  SETTINGS_KEYS.trustProxy,
] as const;
