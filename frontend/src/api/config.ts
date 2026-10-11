import { api } from './client';

export interface RuntimeConfig {
  language: string;
  appName: string;
  appTitle: string;
  /** Admin-set system-wide default appearance for signed-out screens — see ThemeContext. */
  defaultThemeMode: string;
  defaultThemeSkin: string;
  maxAutoSignoutMinutes: number;
  /** A receipt dated more than this many days ago is rejected. */
  receiptMaxAgeDays: number;
  /** Whether receipts are checked by the vision model (Ollama) at all. */
  receiptVerification: boolean;
}

let pending: Promise<RuntimeConfig> | null = null;

/** Server-provided defaults, fetched once and shared by every consumer. */
export function getRuntimeConfig(): Promise<RuntimeConfig> {
  pending ??= api.get<RuntimeConfig>('/config');
  return pending;
}
