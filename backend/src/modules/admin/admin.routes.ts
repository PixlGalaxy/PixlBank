import { Router } from 'express';
import type { Translate } from '../../i18n/index.js';
import type { EnvConfig } from '../../config/env.js';
import { badRequest, notFound, tooManyRequests } from '../../errors.js';
import { createAuthGuards, type AuthenticatedRequest } from '../auth/session.middleware.js';
import { isThemeMode, isThemeSkin } from '../auth/auth.service.js';
import { isLanguage } from '../../i18n/index.js';
import type { SettingsService } from '../../db/settings.js';
import { SETTINGS_KEYS } from './settings-keys.js';
import { parseTrustProxy } from '../../config/trust-proxy.js';
import type { MetricsService } from './metrics.service.js';
import { getBackendStatus, getNginxStatus, restartBackend, restartNginx, tryConsumeRestartBudget } from './process-control.js';
import { getImageInfo, getCpuModel, readCgroupMemory, readDiskUsage } from './system-info.js';
import type { UpdateCheckService } from './update-check.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { RemindersService } from '../mail/reminders.service.js';
import type { ReceiptVerifier } from '../payments/receipt-verifier.js';
import { asyncHandler } from '../../middleware/async-handler.js';

function numberField(body: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  if (body[key] === undefined) return undefined;
  const value = Number(body[key]);
  if (!Number.isFinite(value) || value < min || value > max) throw badRequest('adminSettings.invalidValue');
  return Math.round(value);
}

/** Only http(s) URLs (or empty, to clear); trailing slashes dropped so paths can be appended. */
function urlField(body: Record<string, unknown>, key: string): string | undefined {
  if (body[key] === undefined) return undefined;
  const raw = body[key];
  if (typeof raw !== 'string' || raw.length > 300) throw badRequest('adminSettings.invalidValue');
  const value = raw.trim().replace(/\/+$/, '');
  if (value && !/^https?:\/\//i.test(value)) throw badRequest('adminSettings.invalidValue');
  return value;
}

export function createAdminRoutes(
  t: Translate,
  metrics: MetricsService,
  settings: SettingsService,
  config: EnvConfig,
  backendStartedAt: number,
  updateCheck: UpdateCheckService,
  mail: MailService,
  reminders: RemindersService,
  verifier: ReceiptVerifier,
): Router {
  const router = Router();
  const { requireAuth, requireAdmin } = createAuthGuards(t);

  const booleanField = (body: Record<string, unknown>, key: string, settingKey: string) => {
    if (body[key] === undefined) return;
    if (typeof body[key] !== 'boolean') throw badRequest('adminSettings.invalidValue');
    settings.set(settingKey, String(body[key]));
  };
  const textField = (body: Record<string, unknown>, key: string, settingKey: string, max: number) => {
    if (body[key] === undefined) return;
    const value = body[key];
    if (typeof value !== 'string' || value.length > max) throw badRequest('adminSettings.invalidValue');
    settings.set(settingKey, value.trim());
  };

  router.use(requireAuth, requireAdmin);

  router.get('/metrics', (_req, res) => res.json(metrics.snapshot()));

  router.get('/system', (_req, res) => {
    const load = metrics.getSystemLoad();
    const memory = readCgroupMemory();
    const disks = [readDiskUsage('Data', config.DATA_ROOT)].filter((d) => d !== null);

    res.json({
      image: getImageInfo(config),
      // CPU and memory only make sense as "the container's" numbers, and only
      // exist on Linux (cgroups) — off it (e.g. `npm run dev` on Windows) this
      // is false and the panel shows a notice instead.
      resourcesAvailable: load.cpuUsagePercent !== null || memory !== null,
      cpu: { cores: load.cpuCores, usagePercent: load.cpuUsagePercent, model: getCpuModel() },
      memory,
      disks,
      network: { ...load.networkRateBytesPerSec, ready: load.networkStatsReady },
      update: updateCheck.getStatus(),
    });
  });

  /** Server-sent events: a fresh snapshot every tick, so the dashboard never needs to poll or be refreshed by hand. */
  router.get('/metrics/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    res.write(`data: ${JSON.stringify(metrics.snapshot())}\n\n`);

    const unsubscribe = metrics.subscribe((snapshot) => res.write(`data: ${JSON.stringify(snapshot)}\n\n`));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });

  // Restart-tier fields: "active" is what the running process actually uses
  // right now (baked in at boot), "saved" is what's in the database. They only
  // differ right after an admin edits one, until the backend is restarted.
  router.get('/settings', (req, res) => {
    const savedMaxmindKey = settings.getOptionalString(SETTINGS_KEYS.maxmindLicenseKey);
    const server = {
      sessionTtlHours: { active: config.SESSION_TTL_HOURS, saved: settings.getNumber(SETTINGS_KEYS.sessionTtlHours, config.SESSION_TTL_HOURS) },
      cookieSecure: { active: config.COOKIE_SECURE, saved: settings.getBoolean(SETTINGS_KEYS.cookieSecure, config.COOKIE_SECURE) },
      loginRateLimitMax: {
        active: config.LOGIN_RATE_LIMIT_MAX,
        saved: settings.getNumber(SETTINGS_KEYS.loginRateLimitMax, config.LOGIN_RATE_LIMIT_MAX),
      },
      loginRateLimitWindowMinutes: {
        active: config.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
        saved: settings.getNumber(SETTINGS_KEYS.loginRateLimitWindowMinutes, config.LOGIN_RATE_LIMIT_WINDOW_MINUTES),
      },
      receiptRateLimitMax: {
        active: config.RECEIPT_RATE_LIMIT_MAX,
        saved: settings.getNumber(SETTINGS_KEYS.receiptRateLimitMax, config.RECEIPT_RATE_LIMIT_MAX),
      },
      receiptRateLimitWindowMinutes: {
        active: config.RECEIPT_RATE_LIMIT_WINDOW_MINUTES,
        saved: settings.getNumber(SETTINGS_KEYS.receiptRateLimitWindowMinutes, config.RECEIPT_RATE_LIMIT_WINDOW_MINUTES),
      },
      trustProxy: {
        active: config.TRUST_PROXY_SETTING,
        saved: settings.getString(SETTINGS_KEYS.trustProxy, config.TRUST_PROXY_SETTING),
      },
    };
    const restartRequired =
      Object.values(server).some((field) => field.active !== field.saved) ||
      (savedMaxmindKey ?? '') !== (config.MAXMIND_LICENSE_KEY ?? '');
    const smtp = mail.getConfig();

    res.json({
      server,
      maxmindLicenseKeyActive: Boolean(config.MAXMIND_LICENSE_KEY),
      maxmindLicenseKeySaved: Boolean(savedMaxmindKey),
      restartRequired,
      // Lets the admin confirm the trusted-proxy setting works: behind a proxy
      // that isn't trusted yet, this is the proxy's address instead of theirs.
      yourIp: req.ip ?? null,
      appTitle: settings.getString(SETTINGS_KEYS.appTitle, config.APP_TITLE),
      appName: settings.getString(SETTINGS_KEYS.appName, config.APP_NAME),
      defaultThemeMode: settings.getString(SETTINGS_KEYS.defaultThemeMode, 'dark'),
      defaultThemeSkin: settings.getString(SETTINGS_KEYS.defaultThemeSkin, 'default'),
      defaultLanguage: settings.getString(SETTINGS_KEYS.defaultLanguage, config.LANGUAGE),
      appUrl: mail.appUrl(),
      // The password is write-only: only whether one is stored ever leaves the server.
      smtp: {
        enabled: smtp.enabled,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        from: smtp.from,
        passwordSet: Boolean(smtp.password),
        configured: mail.isConfigured(),
      },
      reminders: reminders.getConfig(),
      ollama: { ...verifier.getConfig(), configured: verifier.isConfigured() },
    });
  });

  router.patch('/settings', (req, res) => {
    const body = req.body as Record<string, unknown>;

    const sessionTtlHours = numberField(body, 'sessionTtlHours', 1, 720);
    if (sessionTtlHours !== undefined) settings.set(SETTINGS_KEYS.sessionTtlHours, String(sessionTtlHours));

    booleanField(body, 'cookieSecure', SETTINGS_KEYS.cookieSecure);

    const loginRateLimitMax = numberField(body, 'loginRateLimitMax', 1, 1000);
    if (loginRateLimitMax !== undefined) settings.set(SETTINGS_KEYS.loginRateLimitMax, String(loginRateLimitMax));

    const loginRateLimitWindowMinutes = numberField(body, 'loginRateLimitWindowMinutes', 1, 1440);
    if (loginRateLimitWindowMinutes !== undefined) {
      settings.set(SETTINGS_KEYS.loginRateLimitWindowMinutes, String(loginRateLimitWindowMinutes));
    }

    const receiptRateLimitMax = numberField(body, 'receiptRateLimitMax', 1, 1000);
    if (receiptRateLimitMax !== undefined) settings.set(SETTINGS_KEYS.receiptRateLimitMax, String(receiptRateLimitMax));

    const receiptRateLimitWindowMinutes = numberField(body, 'receiptRateLimitWindowMinutes', 1, 1440);
    if (receiptRateLimitWindowMinutes !== undefined) {
      settings.set(SETTINGS_KEYS.receiptRateLimitWindowMinutes, String(receiptRateLimitWindowMinutes));
    }

    if (body.trustProxy !== undefined) {
      if (typeof body.trustProxy !== 'string' || body.trustProxy.length > 1000) {
        throw badRequest('adminSettings.invalidTrustProxy');
      }
      const parsed = parseTrustProxy(body.trustProxy);
      if (parsed.invalid.length > 0) throw badRequest('adminSettings.invalidTrustProxy');
      settings.set(SETTINGS_KEYS.trustProxy, parsed.setting);
    }

    if (body.maxmindLicenseKey !== undefined) {
      if (typeof body.maxmindLicenseKey !== 'string') throw badRequest('adminSettings.invalidValue');
      if (body.maxmindLicenseKey === '') settings.delete(SETTINGS_KEYS.maxmindLicenseKey);
      else settings.set(SETTINGS_KEYS.maxmindLicenseKey, body.maxmindLicenseKey);
    }

    if (body.appTitle !== undefined) {
      if (typeof body.appTitle !== 'string' || !body.appTitle.trim() || body.appTitle.length > 100) {
        throw badRequest('adminSettings.invalidValue');
      }
      settings.set(SETTINGS_KEYS.appTitle, body.appTitle.trim());
    }

    if (body.appName !== undefined) {
      if (typeof body.appName !== 'string' || !body.appName.trim() || body.appName.length > 100) {
        throw badRequest('adminSettings.invalidValue');
      }
      settings.set(SETTINGS_KEYS.appName, body.appName.trim());
    }

    if (body.defaultThemeMode !== undefined) {
      if (!isThemeMode(body.defaultThemeMode)) throw badRequest('adminSettings.invalidValue');
      settings.set(SETTINGS_KEYS.defaultThemeMode, body.defaultThemeMode);
    }

    if (body.defaultThemeSkin !== undefined) {
      if (!isThemeSkin(body.defaultThemeSkin)) throw badRequest('adminSettings.invalidValue');
      settings.set(SETTINGS_KEYS.defaultThemeSkin, body.defaultThemeSkin);
    }

    if (body.defaultLanguage !== undefined) {
      if (typeof body.defaultLanguage !== 'string' || !isLanguage(body.defaultLanguage)) {
        throw badRequest('adminSettings.invalidValue');
      }
      settings.set(SETTINGS_KEYS.defaultLanguage, body.defaultLanguage);
    }

    const appUrl = urlField(body, 'appUrl');
    if (appUrl !== undefined) settings.set(SETTINGS_KEYS.appUrl, appUrl);

    // Email (SMTP)
    booleanField(body, 'smtpEnabled', SETTINGS_KEYS.smtpEnabled);
    booleanField(body, 'smtpSecure', SETTINGS_KEYS.smtpSecure);
    textField(body, 'smtpHost', SETTINGS_KEYS.smtpHost, 255);
    textField(body, 'smtpUser', SETTINGS_KEYS.smtpUser, 255);
    textField(body, 'smtpFrom', SETTINGS_KEYS.smtpFrom, 255);
    const smtpPort = numberField(body, 'smtpPort', 1, 65535);
    if (smtpPort !== undefined) settings.set(SETTINGS_KEYS.smtpPort, String(smtpPort));
    // Write-only: an empty string means "keep the current one", so the UI never has to echo it back.
    if (body.smtpPassword !== undefined) {
      if (typeof body.smtpPassword !== 'string' || body.smtpPassword.length > 500) throw badRequest('adminSettings.invalidValue');
      if (body.smtpPassword) settings.set(SETTINGS_KEYS.smtpPassword, body.smtpPassword);
    }

    // Reminders
    booleanField(body, 'remindersEnabled', SETTINGS_KEYS.remindersEnabled);
    const reminderDaysBefore = numberField(body, 'reminderDaysBefore', 0, 30);
    if (reminderDaysBefore !== undefined) settings.set(SETTINGS_KEYS.reminderDaysBefore, String(reminderDaysBefore));
    const reminderHour = numberField(body, 'reminderHour', 0, 23);
    if (reminderHour !== undefined) settings.set(SETTINGS_KEYS.reminderHour, String(reminderHour));

    // Receipt verification (Ollama)
    booleanField(body, 'ollamaEnabled', SETTINGS_KEYS.ollamaEnabled);
    const ollamaUrl = urlField(body, 'ollamaUrl');
    if (ollamaUrl !== undefined) settings.set(SETTINGS_KEYS.ollamaUrl, ollamaUrl);
    textField(body, 'ollamaModel', SETTINGS_KEYS.ollamaModel, 200);
    const ollamaTimeoutSeconds = numberField(body, 'ollamaTimeoutSeconds', 10, 1800);
    if (ollamaTimeoutSeconds !== undefined) settings.set(SETTINGS_KEYS.ollamaTimeoutSeconds, String(ollamaTimeoutSeconds));
    const receiptMaxAgeDays = numberField(body, 'receiptMaxAgeDays', 0, 365);
    if (receiptMaxAgeDays !== undefined) settings.set(SETTINGS_KEYS.receiptMaxAgeDays, String(receiptMaxAgeDays));
    if (body.receiptAmountTolerance !== undefined) {
      const value = Number(body.receiptAmountTolerance);
      if (!Number.isFinite(value) || value < 0 || value > 50) throw badRequest('adminSettings.invalidValue');
      settings.set(SETTINGS_KEYS.receiptAmountTolerance, String(value));
    }

    res.json({ success: true });
  });

  router.post(
    '/mail/test',
    asyncHandler(async (req, res) => {
      const user = (req as AuthenticatedRequest).user!;
      const { to } = req.body as { to?: unknown };
      const address = typeof to === 'string' && to.trim() ? to.trim() : user.email;
      try {
        await mail.sendTest(address, user.language, user.display_name || user.username);
        res.json({ success: true, to: address });
      } catch (err) {
        // Surfaced verbatim: the SMTP server's own message is what the admin needs to fix it.
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  router.get('/mail/log', (_req, res) => res.json(mail.recentLog()));

  router.post(
    '/reminders/run',
    asyncHandler(async (_req, res) => {
      if (!mail.isConfigured()) throw badRequest('mail.notConfigured');
      res.json({ sent: await reminders.runDaily() });
    }),
  );

  router.post(
    '/ollama/test',
    asyncHandler(async (req, res) => {
      const { url } = req.body as { url?: unknown };
      try {
        const models = await verifier.listModels(typeof url === 'string' ? url.trim() : undefined);
        res.json({ success: true, models });
      } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  router.get('/services', (_req, res) => {
    res.json({
      backend: getBackendStatus(backendStartedAt),
      frontend: getNginxStatus(),
    });
  });

  router.post('/services/:service/restart', (req, res) => {
    const service = req.params.service;
    if (service !== 'backend' && service !== 'frontend') throw notFound('adminSettings.unknownService');

    // DB-backed, not in-memory — see tryConsumeRestartBudget for why a backend
    // restart can't be allowed to wipe its own throttle.
    if (!tryConsumeRestartBudget(settings, service)) throw tooManyRequests(5 * 60);

    if (service === 'backend') {
      res.json({ success: true });
      restartBackend();
      return;
    }
    if (!restartNginx()) throw badRequest('adminSettings.serviceRestartFailed');
    return res.json({ success: true });
  });

  return router;
}
