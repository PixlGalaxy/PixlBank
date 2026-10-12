import { Router } from 'express';
import type { Translate } from '../../i18n/index.js';
import type { AuthenticatedRequest } from '../auth/session.middleware.js';
import { createAuthGuards } from '../auth/session.middleware.js';
import { MAX_STREAMS_PER_USER, type LiveEvents } from './live.service.js';

export function createLiveRoutes(t: Translate, live: LiveEvents): Router {
  const router = Router();
  const { requireAuth } = createAuthGuards(t);

  /** Server-sent events: one empty `data` message per change, so open pages reload without a manual refresh. */
  router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
    // Each stream holds a connection open for as long as the page lives; a signed-in client opening
    // hundreds could exhaust the server's, so past a sane number per user the extra ones are refused.
    if (live.openStreams(req.user!.id) >= MAX_STREAMS_PER_USER) {
      res.status(429).json({ error: t('error.tooManyRequests') });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    const unsubscribe = live.subscribe({
      userId: req.user!.id,
      isAdmin: req.user!.role === 'admin',
      send: () => res.write('data: changed\n\n'),
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });

  return router;
}
