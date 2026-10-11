import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defence in depth for CSRF on top of the SameSite=Lax session cookie. The
 * browser stamps every request with where it came from (`Sec-Fetch-Site`);
 * the app's own pages always produce `same-origin`, so a state-changing
 * request from another site — or a sibling subdomain, which Lax does not
 * cover — is refused before any route runs. Requests without the header
 * (non-browser clients, very old browsers) are left to the cookie policy.
 */
export function createCrossSiteGuard(corsOrigins: string[]) {
  // Origins deliberately opened in CORS_ORIGINS may write too; nothing else from another site can.
  const allowed = new Set(corsOrigins);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const site = req.get('sec-fetch-site');
    if ((site === 'cross-site' || site === 'same-site') && !allowed.has(req.get('origin') ?? '')) {
      return next(forbidden('error.crossSiteRequest'));
    }
    next();
  };
}
