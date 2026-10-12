import { createContext, useContext } from 'react';

/**
 * "Hide amounts": every figure formatted through formatMoney turns into
 * "S/ ••••" — for showing the app on a screen or in public without revealing
 * balances. Remembered per browser.
 */

const STORAGE_KEY = 'pixlbank:hide-amounts';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Read by formatMoney, which is a plain function rather than a hook. */
let masked = readStored();

export function amountsHidden(): boolean {
  return masked;
}

export function storeAmountsHidden(hidden: boolean): void {
  masked = hidden;
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');
  } catch {
    // Private mode or blocked storage: it still works for this visit.
  }
}

export interface PrivacyState {
  hidden: boolean;
  toggle: () => void;
}

export const PrivacyContext = createContext<PrivacyState>({ hidden: masked, toggle: () => undefined });

export const usePrivacy = () => useContext(PrivacyContext);
