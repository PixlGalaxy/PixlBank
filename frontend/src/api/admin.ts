import { api } from './client';
import type { ThemeMode, SkinId } from '../theme/themes';

export type ConnectionActivity = 'browsing' | 'downloading' | 'uploading' | 'modifying' | 'idle';

export interface ConnectionSnapshot {
  ip: string;
  country: string | null;
  countryName: string | null;
  kind: 'user' | 'public';
  username?: string;
  activity: ConnectionActivity;
  since: string;
}

export interface MetricsSnapshot {
  totals: { connections: number; uploads: number; downloads: number };
  current: ConnectionSnapshot[];
  countries: { code: string; name: string; count: number }[];
  geoReady: boolean;
  networkStatsReady: boolean;
  bandwidth: { intervalSeconds: number; upload: number[]; download: number[] };
}

export const adminApi = {
  metrics: () => api.get<MetricsSnapshot>('/admin/metrics'),
  metricsStreamUrl: () => '/backend/api/admin/metrics/stream',
};

interface RestartTierField<T> {
  active: T;
  saved: T;
}

export interface AdminSettings {
  server: {
    sessionTtlHours: RestartTierField<number>;
    cookieSecure: RestartTierField<boolean>;
    loginRateLimitMax: RestartTierField<number>;
    loginRateLimitWindowMinutes: RestartTierField<number>;
    receiptRateLimitMax: RestartTierField<number>;
    receiptRateLimitWindowMinutes: RestartTierField<number>;
    /** Comma-separated, as typed — e.g. "uniquelocal, cloudflare". */
    trustProxy: RestartTierField<string>;
  };
  maxmindLicenseKeyActive: boolean;
  maxmindLicenseKeySaved: boolean;
  restartRequired: boolean;
  /** The client IP as the backend resolves it for this request. */
  yourIp: string | null;
  appTitle: string;
  appName: string;
  defaultThemeMode: string;
  defaultThemeSkin: string;
  defaultLanguage: string;
  appUrl: string;
  smtp: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    passwordSet: boolean;
    allowSelfSigned: boolean;
    /** Where the settings in use come from: saved in the Admin Panel, the .env file, or nowhere. */
    source: 'saved' | 'env' | 'none';
    configured: boolean;
  };
  reminders: { enabled: boolean; daysBefore: number; hour: number; lastRun: string | null };
  ollama: {
    enabled: boolean;
    url: string;
    model: string;
    timeoutSeconds: number;
    maxAgeDays: number;
    amountTolerance: number;
    configured: boolean;
  };
}

export interface AdminSettingsPatch {
  sessionTtlHours?: number;
  cookieSecure?: boolean;
  loginRateLimitMax?: number;
  loginRateLimitWindowMinutes?: number;
  receiptRateLimitMax?: number;
  receiptRateLimitWindowMinutes?: number;
  /** Empty string clears it. */
  maxmindLicenseKey?: string;
  /** Empty string means no proxy in front of the container. */
  trustProxy?: string;
  appTitle?: string;
  appName?: string;
  defaultThemeMode?: ThemeMode;
  defaultThemeSkin?: SkinId;
  defaultLanguage?: string;
  appUrl?: string;
  smtpEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  /** Write-only; empty keeps the stored one. */
  smtpPassword?: string;
  smtpFrom?: string;
  smtpAllowSelfSigned?: boolean;
  remindersEnabled?: boolean;
  reminderDaysBefore?: number;
  reminderHour?: number;
  ollamaEnabled?: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  ollamaTimeoutSeconds?: number;
  receiptMaxAgeDays?: number;
  receiptAmountTolerance?: number;
}

export type EmailKind =
  | 'reminder-upcoming'
  | 'reminder-due'
  | 'reminder-overdue'
  | 'payment-received'
  | 'payment-approved'
  | 'payment-rejected'
  | 'admin-payment-review'
  | 'admin-receipt-suspicious'
  | 'test';

export interface EmailLogEntry {
  id: string;
  to_address: string;
  subject: string;
  kind: EmailKind | string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  recipient_name: string | null;
  language: string | null;
  /** Sent from the Admin Panel's test buttons. */
  is_test: number;
  created_at: string;
}

export interface SmtpStatus {
  configured: boolean;
  host: string;
  port: number;
  reachable: boolean;
  pingMs: number | null;
  auth: 'ok' | 'failed' | 'none' | 'skipped';
  error: string | null;
  checkedAt: string;
}

export interface EmailTemplate {
  subject: string;
  title: string;
  message: string;
  button: string;
  smallPrint: string;
}

export interface EmailTemplateEntry {
  kind: EmailKind;
  /** Placeholders available in this kind, without braces. */
  vars: string[];
  languages: Record<string, EmailTemplate & { customized: boolean; defaults: EmailTemplate }>;
}

export const mailApi = {
  test: (to?: string, kind?: EmailKind, language?: string) =>
    api.post<{ success: true; to: string }>('/admin/mail/test', { to, kind, language }),
  log: () => api.get<EmailLogEntry[]>('/admin/mail/log'),
  runReminders: () => api.post<{ sent: number }>('/admin/reminders/run'),
  check: () => api.post<SmtpStatus>('/admin/mail/check'),
  clearSettings: () => api.del<{ success: true }>('/admin/mail/settings'),
  templates: () => api.get<EmailTemplateEntry[]>('/admin/mail/templates'),
  saveTemplates: (templates: Partial<Record<EmailKind, Record<string, EmailTemplate>>>) =>
    api.put<EmailTemplateEntry[]>('/admin/mail/templates', { templates }),
  resetTemplates: () => api.del<EmailTemplateEntry[]>('/admin/mail/templates'),
  preview: (kind: EmailKind, language: string, template: EmailTemplate) =>
    api.post<{ subject: string; html: string }>('/admin/mail/templates/preview', { kind, language, template }),
};

export const ollamaApi = {
  test: (url?: string) => api.post<{ success: true; models: string[] }>('/admin/ollama/test', { url }),
};

export const settingsApi = {
  get: () => api.get<AdminSettings>('/admin/settings'),
  update: (patch: AdminSettingsPatch) => api.patch<{ success: true }>('/admin/settings', patch),
};

export interface ServiceStatus {
  running: boolean;
  uptimeSeconds: number | null;
}

export const servicesApi = {
  status: () => api.get<{ backend: ServiceStatus; frontend: ServiceStatus }>('/admin/services'),
  restart: (service: 'backend' | 'frontend') => api.post<{ success: true }>(`/admin/services/${service}/restart`),
};

export interface ImageInfo {
  nodeVersion: string;
  appVersion: string;
  imageRef: string;
  imageRevision?: string;
  platform: string;
  arch: string;
  osRelease: string;
  containerized: boolean;
}

export interface DiskUsage {
  label: string;
  path: string;
  totalBytes: number;
  usedBytes: number;
}

export interface UpdateStatus {
  checked: boolean;
  updateAvailable: boolean;
  latestRevision: string | null;
  checkedAt: string | null;
}

export interface SystemInfo {
  image: ImageInfo;
  /** False off Linux (no cgroups to read) — cpu/memory are meaningless as host stats, so the UI shows a notice instead. */
  resourcesAvailable: boolean;
  cpu: { cores: number; usagePercent: number | null; model: string | null };
  memory: { totalBytes: number; usedBytes: number } | null;
  disks: DiskUsage[];
  network: { upload: number; download: number; ready: boolean };
  update: UpdateStatus;
}

export const systemApi = {
  get: () => api.get<SystemInfo>('/admin/system'),
};

export type RateLimitSource = 'login' | 'receipt';

export interface RateLimitedIp {
  ip: string;
  source: RateLimitSource;
  hits: number;
  retryAfterSeconds: number;
}

export interface BannedIp {
  ip: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface IpAccessInfo {
  rateLimited: RateLimitedIp[];
  banned: BannedIp[];
}

export const ipAccessApi = {
  get: () => api.get<IpAccessInfo>('/admin/ip-access'),
  clearRateLimit: (source: RateLimitSource, ip: string) =>
    api.del<{ success: true }>(`/admin/ip-access/rate-limit/${source}/${encodeURIComponent(ip)}`),
  ban: (ip: string, reason?: string) => api.post<{ success: true }>('/admin/ip-access/banned', { ip, reason }),
  unban: (ip: string) => api.del<{ success: true }>(`/admin/ip-access/banned/${encodeURIComponent(ip)}`),
};
