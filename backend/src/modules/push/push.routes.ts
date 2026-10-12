import { Router } from 'express';
import type { Translate } from '../../i18n/index.js';
import { isLanguage } from '../../i18n/index.js';
import type { AuthenticatedRequest } from '../auth/session.middleware.js';
import { createAuthGuards } from '../auth/session.middleware.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { badRequest } from '../../errors.js';
import type { MailService } from '../mail/mail.service.js';
import { isEmailKind } from '../mail/templates.js';
import type { PushService } from './push.service.js';

export function createPushRoutes(t: Translate, push: PushService, mail: MailService): Router {
  const router = Router();
  const { requireAuth, requireAdmin } = createAuthGuards(t);

  router.use(requireAuth);

  /** The VAPID public key the browser needs to subscribe. */
  router.get('/key', (_req, res) => res.json({ publicKey: push.getPublicKey() }));

  router.get('/devices', (req: AuthenticatedRequest, res) => res.json(push.devices(req.user!.id)));

  router.post('/subscription', (req: AuthenticatedRequest, res) => {
    push.subscribe(req.user!.id, (req.body as { subscription?: unknown }).subscription, req.get('user-agent'));
    res.status(201).json({ success: true });
  });

  router.delete('/subscription', (req: AuthenticatedRequest, res) => {
    push.unsubscribe(req.user!.id, (req.body as { endpoint?: unknown }).endpoint);
    res.json({ success: true });
  });

  /** Admin Panel: a sample of one kind to the admin's own devices only — never to anyone else. */
  router.post(
    '/test',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { kind, language } = req.body as { kind?: unknown; language?: unknown };
      if (!isEmailKind(kind)) throw badRequest('adminSettings.invalidValue');
      const user = req.user!;
      const lang = typeof language === 'string' && isLanguage(language) ? language : user.language;
      const { sent, errors } = await mail.pushSample(user.id, kind, lang, user.display_name || user.username);
      res.json({ sent, errors, devices: push.devices(user.id).length });
    }),
  );

  return router;
}
