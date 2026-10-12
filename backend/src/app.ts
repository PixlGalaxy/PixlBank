import express from 'express';
import cookieParser from 'cookie-parser';
import type { Db } from './db/client.js';
import type { EnvConfig } from './config/env.js';
import { SettingsService } from './db/settings.js';
import { SETTINGS_KEYS } from './modules/admin/settings-keys.js';
import { createEmailTranslator, createTranslator } from './i18n/index.js';
import { requestLogger } from './middleware/request-logger.js';
import { createSessionMiddleware } from './modules/auth/session.middleware.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createUsersRoutes } from './modules/users/users.routes.js';
import { createLogsRoutes } from './modules/logs/logs.routes.js';
import { createAvatarsRoutes, ensureAvatarsDir } from './modules/avatars/avatars.routes.js';
import { createErrorHandler, createNotFoundHandler } from './middleware/error-handler.js';
import { GeoipService } from './modules/admin/geoip.service.js';
import { MetricsService } from './modules/admin/metrics.service.js';
import { createConnectionTracker } from './middleware/connection-tracker.js';
import { createAdminRoutes } from './modules/admin/admin.routes.js';
import { UpdateCheckService } from './modules/admin/update-check.service.js';
import { IpBansService } from './modules/admin/ip-bans.service.js';
import { createIpBanMiddleware } from './middleware/ip-ban.js';
import { createCrossSiteGuard } from './middleware/csrf.js';
import { createCors } from './middleware/cors.js';
import { createIpAccessRoutes } from './modules/admin/ip-access.routes.js';
import { LoansService } from './modules/loans/loans.service.js';
import { createLoansRoutes } from './modules/loans/loans.routes.js';
import { ScoreService } from './modules/loans/score.service.js';
import { MailService } from './modules/mail/mail.service.js';
import { RemindersService } from './modules/mail/reminders.service.js';
import { ReceiptVerifier } from './modules/payments/receipt-verifier.js';
import { PaymentsService } from './modules/payments/payments.service.js';
import { createPaymentsRoutes } from './modules/payments/payments.routes.js';
import { LiveEvents } from './modules/live/live.service.js';
import { PushService } from './modules/push/push.service.js';
import { createPushRoutes } from './modules/push/push.routes.js';
import { createLiveRoutes } from './modules/live/live.routes.js';

export function createApp(db: Db, config: EnvConfig): express.Application {
  const app = express();
  const t = createTranslator(config.LOCALES_DIR, config.LANGUAGE);
  const te = createEmailTranslator(config.LOCALES_DIR);

  const geoip = new GeoipService(config);
  void geoip.init();
  const metrics = new MetricsService(geoip);
  const settings = new SettingsService(db);
  const backendStartedAt = Date.now();
  const updateCheck = new UpdateCheckService(config.IMAGE_REVISION, config.UPDATE_CHECK_ENABLED);
  const ipBans = new IpBansService(db);

  const live = new LiveEvents();
  const loans = new LoansService(db, live);
  const push = new PushService(db, settings);
  const mail = new MailService(db, settings, config, te, push);
  const verifier = new ReceiptVerifier(settings, config);
  const payments = new PaymentsService(db, loans, verifier, mail, te, config.RECEIPTS_DIR);
  payments.resumePending();
  const reminders = new RemindersService(db, settings, loans, mail);
  reminders.start();

  // The bundled nginx (loopback) plus any outer proxies from TRUST_PROXY, so
  // req.ip is the visitor's address rather than the proxy's.
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  // Before anything else — a banned IP shouldn't get session/cookie handling, let alone a route.
  app.use(createIpBanMiddleware(ipBans));
  app.use(createCors(config.CORS_ORIGINS));
  app.use(createCrossSiteGuard(config.CORS_ORIGINS));
  app.use(requestLogger);
  // Everything the API returns is confidential: no proxy or browser cache keeps
  // it unless a route opts into a private cache (receipts, avatars).
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(createSessionMiddleware(db, config.SESSION_TTL_HOURS));
  // After the session middleware so req.user/req.session are already resolved.
  app.use(createConnectionTracker(metrics));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  // Lets the static frontend pick up runtime settings without a rebuild. Read
  // fresh here (not baked into `config`), so an admin panel edit takes effect
  // on the very next request.
  app.get('/api/config', (_req, res) =>
    res.json({
      language: settings.getString(SETTINGS_KEYS.defaultLanguage, config.LANGUAGE),
      appName: settings.getString(SETTINGS_KEYS.appName, config.APP_NAME),
      appTitle: settings.getString(SETTINGS_KEYS.appTitle, config.APP_TITLE),
      defaultThemeMode: settings.getString(SETTINGS_KEYS.defaultThemeMode, 'dark'),
      defaultThemeSkin: settings.getString(SETTINGS_KEYS.defaultThemeSkin, 'default'),
      // A session dies at SESSION_TTL_HOURS regardless of activity, so an
      // inactivity timeout longer than that would never actually trigger.
      maxAutoSignoutMinutes: config.SESSION_TTL_HOURS * 60,
      receiptMaxAgeDays: verifier.getConfig().maxAgeDays,
      receiptVerification: verifier.isConfigured(),
    }),
  );

  const { router: authRoutes, loginIpLimiter } = createAuthRoutes(db, config, t, metrics);
  app.use('/api/auth', authRoutes);
  // Account and avatar edits show up on the lender's pages (names, photos, the debtor list).
  app.use(['/api/users', '/api/avatars'], (req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => res.statusCode < 400 && live.publish(null));
    next();
  });
  app.use(
    '/api/users',
    createUsersRoutes(db, t, metrics, () => settings.getString(SETTINGS_KEYS.defaultLanguage, config.LANGUAGE)),
  );
  app.use('/api/logs', createLogsRoutes(t));
  ensureAvatarsDir(config);
  app.use('/api/avatars', createAvatarsRoutes(db, config, t));

  app.use('/api/loans', createLoansRoutes(t, loans, payments, reminders, mail, new ScoreService(db)));
  const { router: paymentsRoutes, receiptIpLimiter } = createPaymentsRoutes(t, config, payments);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/live', createLiveRoutes(t, live));
  app.use('/api/push', createPushRoutes(t, push, mail));

  app.use(
    '/api/admin',
    createAdminRoutes(t, metrics, settings, config, backendStartedAt, updateCheck, mail, reminders, verifier),
  );
  app.use('/api/admin/ip-access', createIpAccessRoutes(t, loginIpLimiter, receiptIpLimiter, ipBans));

  app.use(createNotFoundHandler(t));
  app.use(createErrorHandler(t));
  return app;
}
