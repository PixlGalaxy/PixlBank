import { useEffect } from 'react';
import type { LoanDetail } from '../api/loans';

/**
 * Receipts are scored in the background after they're sent, so while any
 * payment on screen is still being analyzed, quietly reload every few seconds
 * until the score lands.
 */
export function usePollWhileAnalyzing(loans: LoanDetail[] | null, reload: () => Promise<unknown>, intervalMs = 5000) {
  const analyzing = (loans ?? []).some((l) => l.payments.some((p) => p.ai_status === 'pending'));
  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(() => void reload(), intervalMs);
    return () => clearInterval(timer);
  }, [analyzing, reload, intervalMs]);
}
