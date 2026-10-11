import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getRuntimeConfig } from '../api/config';

interface AppConfig {
  /** Product name used in copy and image alt text. */
  appName: string;
  /** Browser tab title. */
  appTitle: string;
  /** A receipt dated more than this many days ago is rejected. */
  receiptMaxAgeDays: number;
  receiptVerification: boolean;
}

const FALLBACK: AppConfig = { appName: 'PixlBank', appTitle: 'PixlBank', receiptMaxAgeDays: 5, receiptVerification: false };

const AppConfigContext = createContext<AppConfig>(FALLBACK);

/** Names come from the server so they can be changed without a rebuild. */
export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<AppConfig>(FALLBACK);

  useEffect(() => {
    getRuntimeConfig()
      .then((config) =>
        setBranding({
          appName: config.appName || FALLBACK.appName,
          appTitle: config.appTitle || FALLBACK.appTitle,
          receiptMaxAgeDays: config.receiptMaxAgeDays ?? FALLBACK.receiptMaxAgeDays,
          receiptVerification: config.receiptVerification === true,
        }),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.title = branding.appTitle;
  }, [branding.appTitle]);

  return <AppConfigContext.Provider value={branding}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
