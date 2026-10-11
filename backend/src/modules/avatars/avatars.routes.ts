import { Router } from 'express';
import { createWriteStream, promises as fs, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import busboy from 'busboy';
import type { Db } from '../../db/client.js';
import type { EnvConfig } from '../../config/env.js';
import type { Translate } from '../../i18n/index.js';
import type { AuthenticatedRequest } from '../auth/session.middleware.js';
import { createAuthGuards } from '../auth/session.middleware.js';
import { toPublicUser } from '../auth/auth.service.js';
import { badRequest, notFound } from '../../errors.js';
import { routeParam } from '../../route-params.js';
import { SERVE_OPTIONS } from '../../serve-options.js';
import { AvatarsService, EXT_BY_MIME, MIME_BY_EXT } from './avatars.service.js';
import { sniffImage, uploadResponseHeaders } from '../../image-sniff.js';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ensureAvatarsDir(config: EnvConfig): void {
  mkdirSync(config.AVATARS_DIR, { recursive: true });
}

export function createAvatarsRoutes(db: Db, config: EnvConfig, t: Translate): Router {
  const router = Router();
  const avatars = new AvatarsService(db, config.AVATARS_DIR);
  const { requireAuth } = createAuthGuards(t);

  router.use(requireAuth);

  // The lender sees every avatar; a debtor only their own and the lender's —
  // other debtors are confidential, so they get the same 404 as a missing one.
  router.get('/:userId', (req: AuthenticatedRequest, res, next) => {
    const userId = routeParam(req.params.userId);
    if (req.user!.role !== 'admin' && userId !== req.user!.id) {
      const target = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
      if (target?.role !== 'admin') return next(notFound());
    }
    let filename: string | null;
    try {
      filename = avatars.filenameFor(userId);
    } catch (err) {
      return next(err);
    }
    if (!filename) return next(notFound());

    const ext = filename.split('.').pop() ?? '';
    for (const [name, value] of Object.entries(uploadResponseHeaders(MIME_BY_EXT[ext] ?? 'application/octet-stream'))) {
      res.setHeader(name, value);
    }
    // Revalidate every time: the client cache-busts with ?v=<updated_at> instead.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(avatars.absolutePath(filename), SERVE_OPTIONS, (err) => {
      if (err) next(notFound());
    });
  });

  router.post('/me', (req: AuthenticatedRequest, res, next) => {
    const userId = req.user!.id;
    const parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_AVATAR_BYTES } });

    let sawFile = false;
    let failure: unknown = null;
    let partial = '';
    let filename = '';
    let write: Promise<void> = Promise.resolve();

    parser.on('file', (_field, stream, info) => {
      sawFile = true;

      const ext = EXT_BY_MIME[info.mimeType];
      if (!ext) {
        failure = badRequest('avatars.invalidType');
        stream.resume();
        return;
      }

      filename = `${userId}.${ext}`;
      partial = `${avatars.absolutePath(filename)}.part`;

      // busboy stops the stream once fileSize is hit but still ends it "cleanly".
      let truncated = false;
      stream.on('limit', () => {
        truncated = true;
        failure ??= badRequest('avatars.tooLarge');
      });

      write = pipeline(stream, createWriteStream(partial))
        .then(async () => {
          if (truncated) throw failure;
          // The declared type is only a hint; the bytes must agree with it.
          const handle = await fs.open(partial, 'r');
          const header = Buffer.alloc(16);
          try {
            await handle.read(header, 0, 16, 0);
          } finally {
            await handle.close();
          }
          if (sniffImage(header) !== info.mimeType) throw badRequest('avatars.invalidType');
          await fs.rename(partial, avatars.absolutePath(filename));
        })
        .catch((err) => {
          failure ??= err;
        });
    });

    parser.on('error', (err) => {
      failure ??= err;
    });

    parser.on('close', () => {
      void (async () => {
        await write;

        if (!sawFile) return next(badRequest('avatars.noFile'));
        if (failure) {
          if (partial) await fs.rm(partial, { force: true }).catch(() => undefined);
          return next(failure);
        }

        const updated = await avatars.save(userId, filename);
        res.json(toPublicUser(updated));
      })();
    });

    req.pipe(parser);
  });

  router.delete('/me', (req: AuthenticatedRequest, res, next) => {
    void avatars
      .remove(req.user!.id)
      .then((updated) => res.json(toPublicUser(updated)))
      .catch(next);
  });

  return router;
}
