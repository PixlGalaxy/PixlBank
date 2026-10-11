import type { Request, Response, NextFunction } from 'express';
import type { Translate } from '../i18n/index.js';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';

export function createErrorHandler(t: Translate) {
  return (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      if (err.headers) {
        for (const [name, value] of Object.entries(err.headers)) res.setHeader(name, value);
      }
      return res.status(err.status).json({ error: t(err.key) });
    }

    // Malformed or oversized JSON bodies (body-parser) are the client's fault:
    // answer 400/413 instead of logging them as server errors.
    const status = (err as { status?: number; type?: string }).status;
    if (status === 400 || status === 413) {
      return res.status(status).json({ error: t('error.invalidInput') });
    }

    logger.error('Unhandled request error', err);
    return res.status(500).json({ error: t('error.internal') });
  };
}

export function createNotFoundHandler(t: Translate) {
  return (_req: Request, res: Response) => res.status(404).json({ error: t('error.notFound') });
}
