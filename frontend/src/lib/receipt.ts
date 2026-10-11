import type { ReasonCode } from '../api/loans';
import type { TranslationKey } from '../i18n/translations';
import { formatDate, formatMoney } from './money';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Same wording as the emails (both read the shared `receipt.reason.*` locale keys). */
export function reasonText(
  t: Translate,
  language: string,
  reason: ReasonCode,
  details: { detectedAmountCents: number | null; detectedDate: string | null; maxAgeDays: number; currency: string },
): string {
  return t(`receipt.reason.${reason}` as TranslationKey, {
    days: details.maxAgeDays,
    date: details.detectedDate ? formatDate(details.detectedDate, language) : '—',
    detected: details.detectedAmountCents === null ? '—' : formatMoney(details.detectedAmountCents, details.currency, language),
  });
}
