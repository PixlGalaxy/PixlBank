import { mkdirSync } from 'fs';
import { loadEnv } from './config/env.js';
import { initializeDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { SettingsService } from './db/settings.js';
import { SETTINGS_KEYS } from './modules/admin/settings-keys.js';
import { parseTrustProxy } from './config/trust-proxy.js';
import { bootstrapAdmin } from './modules/auth/bootstrap.js';
import { createApp } from './app.js';
import { startFrontendLogTailer } from './modules/logs/frontend-log-tailer.js';
import { logger } from './logger.js';

async function main() {
  let config = loadEnv();

  mkdirSync(config.DATA_ROOT, { recursive: true });
  mkdirSync(config.AVATARS_DIR, { recursive: true });
  mkdirSync(config.RECEIPTS_DIR, { recursive: true });

  const db = initializeDb(config.DB_PATH);
  runMigrations(db);

  // Admin-panel overrides for the settings that are baked into closures at
  // startup (rate limiters, session TTL, GeoIP) — anything an admin has saved
  // from Settings wins over the env default from here on, until the next
  // restart re-reads it the same way.
  const settings = new SettingsService(db);
  // A saved value wins even when empty: that means "nothing in front of the container".
  const savedTrustProxy = settings.has(SETTINGS_KEYS.trustProxy)
    ? parseTrustProxy(settings.getString(SETTINGS_KEYS.trustProxy, ''))
    : null;
  if (savedTrustProxy && savedTrustProxy.invalid.length > 0) {
    logger.warn(`Ignoring unrecognized trusted proxy entries: ${savedTrustProxy.invalid.join(', ')}`);
  }
  config = {
    ...config,
    SESSION_TTL_HOURS: settings.getNumber(SETTINGS_KEYS.sessionTtlHours, config.SESSION_TTL_HOURS),
    COOKIE_SECURE: settings.getBoolean(SETTINGS_KEYS.cookieSecure, config.COOKIE_SECURE),
    LOGIN_RATE_LIMIT_MAX: settings.getNumber(SETTINGS_KEYS.loginRateLimitMax, config.LOGIN_RATE_LIMIT_MAX),
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: settings.getNumber(
      SETTINGS_KEYS.loginRateLimitWindowMinutes,
      config.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
    ),
    RECEIPT_RATE_LIMIT_MAX: settings.getNumber(SETTINGS_KEYS.receiptRateLimitMax, config.RECEIPT_RATE_LIMIT_MAX),
    RECEIPT_RATE_LIMIT_WINDOW_MINUTES: settings.getNumber(
      SETTINGS_KEYS.receiptRateLimitWindowMinutes,
      config.RECEIPT_RATE_LIMIT_WINDOW_MINUTES,
    ),
    MAXMIND_LICENSE_KEY: settings.getOptionalString(SETTINGS_KEYS.maxmindLicenseKey) ?? config.MAXMIND_LICENSE_KEY,
    ...(savedTrustProxy && { TRUST_PROXY: savedTrustProxy.trusted, TRUST_PROXY_SETTING: savedTrustProxy.setting }),
  };

  await bootstrapAdmin(db, config);

  startFrontendLogTailer();

  const onListening = () => {
    logger.info(`Listening on ${config.HOST ?? 'all interfaces'}:${config.PORT} (${config.NODE_ENV})`);
    logger.info(`Data root: ${config.DATA_ROOT}`);
    logger.info(config.CORS_ORIGINS.length ? `CORS allowed origins: ${config.CORS_ORIGINS.join(', ')}` : 'CORS: same-origin only');
    logger.info(
      config.TRUST_PROXY_SETTING
        ? `Trusted proxies: loopback, ${config.TRUST_PROXY_SETTING}`
        : 'Trusted proxies: loopback only (set them in Admin Panel -> Settings when running behind another reverse proxy)',
    );
  };
  const app = createApp(db, config);
  if (config.HOST) app.listen(config.PORT, config.HOST, onListening);
  else app.listen(config.PORT, onListening);
}

main().catch((err) => {
  logger.error('Fatal error during startup', err);
  process.exit(1);
});
