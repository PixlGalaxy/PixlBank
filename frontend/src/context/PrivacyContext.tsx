import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { amountsHidden, PrivacyContext, storeAmountsHidden } from '../lib/privacy';

/** Holds the "hide amounts" switch; see lib/privacy.ts. */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(amountsHidden);
  const toggle = useCallback(() => {
    setHidden((current) => {
      // Flipped before the re-render, so formatMoney already masks (or unmasks) on it.
      storeAmountsHidden(!current);
      return !current;
    });
  }, []);
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
