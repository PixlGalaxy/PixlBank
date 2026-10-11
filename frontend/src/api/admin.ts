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

export interface EmailLogEntry {
  id: string;
  to_address: string;
  subject: string;
  kind: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

export const mailApi = {
  test: (to?: string) => api.post<{ success: true; to: string }>('/admin/mail/test', { to }),
  log: () => api.get<EmailLogEntry[]>('/admin/mail/log'),
  runReminders: () => api.post<{ sent: number }>('/admin/reminders/run'),
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
