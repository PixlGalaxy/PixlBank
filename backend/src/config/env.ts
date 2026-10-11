import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { isLanguage, type Language } from '../i18n/index.js';
import { logger } from '../logger.js';
import { parseTrustProxy } from './trust-proxy.js';
import { parseCorsOrigins } from '../middleware/cors.js';

// src/config/env.ts (or dist/config/env.js) -> repo root
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface EnvConfig {
  NODE_ENV: 'development' | 'production';
  PORT: number;
  /** Interface to listen on. Loopback in production: only the bundled nginx should reach the API directly. */
  HOST: string | undefined;
  DATA_ROOT: string;
  DB_PATH: string;
  AVATARS_DIR: string;
  /** Payment receipts uploaded by debtors — kept as a permanent record of every report. */
  RECEIPTS_DIR: string;
  LOCALES_DIR: string;
  SESSION_TTL_HOURS: number;
  COOKIE_SECURE: boolean;
  /** Max login attempts allowed per IP and per account within the window below. */
  LOGIN_RATE_LIMIT_MAX: number;
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: number;
  /** Max payment receipts a single IP may submit within the window below (each one costs an Ollama call). */
  RECEIPT_RATE_LIMIT_MAX: number;
  RECEIPT_RATE_LIMIT_WINDOW_MINUTES: number;
  LANGUAGE: Language;
  /** Shown in the browser tab. */
  APP_TITLE: string;
  /** Product name used in UI copy, emails and image alt text. */
  APP_NAME: string;
  /** The one and only lender account. Created on first boot; its password is then managed from the web UI. */
  ADMIN_USERNAME: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  ADMIN_DISPLAY_NAME?: string;
  /** Public URL of this install, used for links inside emails. */
  APP_URL?: string;
  /** Defaults for Admin Panel -> Settings -> Email (SMTP). */
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  /** Defaults for Admin Panel -> Settings -> Receipt verification (Ollama). */
  OLLAMA_URL?: string;
  OLLAMA_MODEL: string;
  /** Optional: enables the admin dashboard's world map. Without it, the map just has no dots. */
  MAXMIND_LICENSE_KEY?: string;
  /** Where the downloaded GeoLite2-Country.mmdb is cached across restarts. */
  GEOIP_DIR: string;
  /** Read from backend/package.json at boot — shown on the admin panel's System page. */
  BACKEND_VERSION: string;
  /** The published tag (e.g. "latest", "1.2.3") baked in by the publish workflow — "dev" for a plain local `docker build`. */
  IMAGE_REF: string;
  /** Git commit the running image was built from, if the publish workflow set it. */
  IMAGE_REVISION?: string;
  /** Periodically asks GitHub if `main` has moved past IMAGE_REVISION — set DISABLE_UPDATE_CHECK=true to turn off. */
  UPDATE_CHECK_ENABLED: boolean;
  /** Proxies allowed to report the client IP in X-Forwarded-For (always includes loopback). See trust-proxy.ts. */
  TRUST_PROXY: string[];
  /** The same, as typed by the admin (e.g. "uniquelocal, cloudflare") — shown in the admin panel. */
  TRUST_PROXY_SETTING: string;
  /** Extra browser origins allowed to call the API (CORS_ORIGINS). Empty = same-origin only. */
  CORS_ORIGINS: string[];
}

export function loadEnv(): EnvConfig {
  const env = process.env;
  const isProd = env.NODE_ENV === 'production';

  // Mounted volume in production; a folder at the repo root in development.
  const DATA_ROOT = resolve(env.DATA_ROOT || (isProd ? '/data' : join(repoRoot, 'data')));

  if (env.LANGUAGE && !isLanguage(env.LANGUAGE)) {
    logger.warn(`Unsupported LANGUAGE "${env.LANGUAGE}", falling back to "en"`);
  }

  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  if (trustProxy.invalid.length > 0) {
    logger.warn(`Ignoring unrecognized TRUST_PROXY entries: ${trustProxy.invalid.join(', ')}`);
  }

  let backendVersion = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'backend', 'package.json'), 'utf-8')) as { version?: string };
    if (pkg.version) backendVersion = pkg.version;
  } catch {
    // Best-effort — shown on the System page, never load-bearing.
  }

  return {
    NODE_ENV: isProd ? 'production' : 'development',
    PORT: parseInt(env.PORT || '4000', 10),
    // Unset in development so the Vite proxy reaches it whichever of
    // 127.0.0.1 / ::1 "localhost" resolves to on the machine.
    HOST: env.HOST || (isProd ? '127.0.0.1' : undefined),
    DATA_ROOT,
    DB_PATH: env.DB_PATH || join(DATA_ROOT, 'pixlbank.sqlite'),
    AVATARS_DIR: env.AVATARS_DIR || join(DATA_ROOT, 'avatars'),
    RECEIPTS_DIR: env.RECEIPTS_DIR || join(DATA_ROOT, 'receipts'),
    // Shared with the frontend so both render the same strings.
    LOCALES_DIR: resolve(env.LOCALES_DIR || join(repoRoot, 'backend', 'locales')),
    SESSION_TTL_HOURS: parseInt(env.SESSION_TTL_HOURS || '24', 10),
    LOGIN_RATE_LIMIT_MAX: parseInt(env.LOGIN_RATE_LIMIT_MAX || '10', 10),
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: parseInt(env.LOGIN_RATE_LIMIT_WINDOW_MINUTES || '15', 10),
    RECEIPT_RATE_LIMIT_MAX: parseInt(env.RECEIPT_RATE_LIMIT_MAX || '10', 10),
    RECEIPT_RATE_LIMIT_WINDOW_MINUTES: parseInt(env.RECEIPT_RATE_LIMIT_WINDOW_MINUTES || '60', 10),
    // Off by default: behind plain-HTTP nginx a Secure cookie would never be sent back.
    COOKIE_SECURE: env.COOKIE_SECURE === 'true',
    LANGUAGE: isLanguage(env.LANGUAGE) ? env.LANGUAGE : 'en',
    APP_TITLE: env.APP_TITLE || 'PixlBank',
    APP_NAME: env.APP_NAME || 'PixlBank',
    ADMIN_USERNAME: (env.ADMIN_USERNAME || '').trim(),
    ADMIN_EMAIL: (env.ADMIN_EMAIL || '').trim(),
    ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
    ADMIN_DISPLAY_NAME: env.ADMIN_DISPLAY_NAME || undefined,
    APP_URL: env.APP_URL ? env.APP_URL.replace(/\/+$/, '') : undefined,
    SMTP_HOST: env.SMTP_HOST || undefined,
    SMTP_PORT: parseInt(env.SMTP_PORT || '587', 10),
    SMTP_SECURE: env.SMTP_SECURE === 'true',
    SMTP_USER: env.SMTP_USER || undefined,
    SMTP_PASSWORD: env.SMTP_PASSWORD || undefined,
    SMTP_FROM: env.SMTP_FROM || undefined,
    OLLAMA_URL: env.OLLAMA_URL ? env.OLLAMA_URL.replace(/\/+$/, '') : undefined,
    OLLAMA_MODEL: env.OLLAMA_MODEL || 'gemma3:12b',
    MAXMIND_LICENSE_KEY: env.MAXMIND_LICENSE_KEY || undefined,
    GEOIP_DIR: env.GEOIP_DIR || join(DATA_ROOT, 'geoip'),
    BACKEND_VERSION: backendVersion,
    IMAGE_REF: env.APP_IMAGE_REF || 'dev',
    IMAGE_REVISION: env.APP_IMAGE_REVISION || undefined,
    UPDATE_CHECK_ENABLED: env.DISABLE_UPDATE_CHECK !== 'true',
    TRUST_PROXY: trustProxy.trusted,
    TRUST_PROXY_SETTING: trustProxy.setting,
    CORS_ORIGINS: parseCorsOrigins(env.CORS_ORIGINS),
  };
}
