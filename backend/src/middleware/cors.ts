import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger.js';

/**
 * Parses CORS_ORIGINS ("https://a.com, https://b.example.com:8443") into exact
 * origins. "*" is refused: the API authenticates with a cookie, and browsers
 * never send credentials to a wildcard origin anyway.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const origins: string[] = [];
  for (const entry of (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (entry === '*') {
      logger.warn('Ignoring CORS_ORIGINS "*": list each allowed origin explicitly');
      continue;
    }
    try {
      const url = new URL(entry);
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search) throw new Error();
      origins.push(url.origin);
    } catch {
      logger.warn(`Ignoring invalid CORS_ORIGINS entry "${entry}" (expected e.g. https://app.example.com)`);
    }
  }
  return origins;
}

/**
 * Lets the listed origins call the API from the browser, with cookies. With
 * the list empty (the default) no CORS headers are ever sent, so only the
 * app's own pages — served from the same origin by nginx — can use it.
 */
export function createCors(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (!origin || !allowed.has(origin)) return next();

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.append('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.status(204).end();
    }
    return next();
  };
}
