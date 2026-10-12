import { randomUUID } from 'crypto';
import webpush, { WebPushError } from 'web-push';
import type { Db } from '../../db/client.js';
import type { SettingsService } from '../../db/settings.js';
import { SETTINGS_KEYS } from '../admin/settings-keys.js';
import { badRequest } from '../../errors.js';
import { logger } from '../../logger.js';

export interface PushPayload {
  title: string;
  body: string;
  /** Path opened when the notification is tapped. */
  url: string;
  /** Same tag replaces an older notification instead of stacking (e.g. one per loan reminder). */
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_sent_at: string | null;
}

export interface PushResult {
  sent: number;
  /** Why each failed device failed, as the push service put it (shown by the Admin Panel's tests). */
  errors: string[];
}

export interface PushDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSentAt: string | null;
}

/** Apple (Safari / iOS home screen apps), Google (Chrome, Edge on Android), Mozilla, Microsoft. */
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

/**
 * Only the browser vendors' push services may receive our notifications: the
 * server POSTs to whatever endpoint is registered, so an arbitrary URL would
 * let any signed-in user aim it at hosts on the server's own network.
 */
function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Web Push to the devices where a user turned notifications on — on top of the
 * emails, never instead of them. The VAPID key pair that signs every push is
 * generated once and kept in app_settings; changing it would orphan every
 * existing subscription, so it never rotates on its own.
 */
export class PushService {
  private publicKey: string;

  constructor(
    private db: Db,
    settings: SettingsService,
    adminEmail: () => string,
  ) {
    let publicKey = settings.getOptionalString(SETTINGS_KEYS.vapidPublicKey);
    let privateKey = settings.getOptionalString(SETTINGS_KEYS.vapidPrivateKey);
    if (!publicKey || !privateKey) {
      ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
      settings.set(SETTINGS_KEYS.vapidPublicKey, publicKey);
      settings.set(SETTINGS_KEYS.vapidPrivateKey, privateKey);
      logger.info('Generated the Web Push (VAPID) key pair');
    }
    this.publicKey = publicKey;
    // Apple rejects pushes whose subject isn't a mailto: or https: URL.
    webpush.setVapidDetails(`mailto:${adminEmail() || 'admin@localhost'}`, publicKey, privateKey);
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  /** Registers (or moves to this user) the device's subscription. */
  subscribe(userId: string, input: unknown, userAgent: string | undefined): void {
    const sub = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (
      typeof endpoint !== 'string' ||
      endpoint.length > 2000 ||
      !isPushEndpoint(endpoint) ||
      typeof p256dh !== 'string' ||
      p256dh.length > 200 ||
      typeof auth !== 'string' ||
      auth.length > 100
    ) {
      throw badRequest('error.invalidInput');
    }
    // One device, one owner: signing in as someone else on the same phone takes the subscription over.
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent`,
      )
      .run(randomUUID(), userId, endpoint, p256dh, auth, userAgent?.slice(0, 300) ?? null);
  }

  unsubscribe(userId: string, endpoint: unknown): void {
    if (typeof endpoint !== 'string') throw badRequest('error.invalidInput');
    this.db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  }

  devices(userId: string): PushDevice[] {
    const rows = this.db
      .prepare('SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as SubscriptionRow[];
    return rows.map((r) => ({ id: r.id, userAgent: r.user_agent, createdAt: r.created_at, lastSentAt: r.last_sent_at }));
  }

  /**
   * Sends to every device of an active user. Never throws: a push outage must
   * not break what triggered it. Returns how many devices accepted it, and why the others didn't.
   */
  async notifyUser(userId: string, payload: PushPayload): Promise<PushResult> {
    const rows = this.db
      .prepare(
        `SELECT s.* FROM push_subscriptions s JOIN users u ON u.id = s.user_id
         WHERE s.user_id = ? AND u.is_active = 1`,
      )
      .all(userId) as SubscriptionRow[];
    const body = JSON.stringify(payload);
    const results = await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, body, {
            TTL: 24 * 60 * 60,
            urgency: 'high',
            timeout: 10_000,
          });
          this.db.prepare("UPDATE push_subscriptions SET last_sent_at = datetime('now') WHERE id = ?").run(row.id);
          return null;
        } catch (err) {
          // The push service's own reason (e.g. Apple's {"reason":"BadJwtToken"}) is in the body, not the message.
          const reason =
            err instanceof WebPushError
              ? `${err.statusCode} ${err.body?.trim() || err.message}`.slice(0, 300)
              : err instanceof Error
                ? err.message
                : String(err);
          // 404/410: the device unsubscribed or the app was removed — forget it.
          if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
            this.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
          }
          logger.warn(`Push to a device of user ${userId} (${new URL(row.endpoint).hostname}) failed: ${reason}`);
          return reason;
        }
      }),
    );
    const errors = results.filter((r): r is string => r !== null);
    return { sent: results.length - errors.length, errors };
  }
}
