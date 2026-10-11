/** Amounts travel as integer cents; this is the only place they become text. */
export function formatMoney(cents: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Short form for chart axes: "S/ 12K". */
export function formatMoneyCompact(cents: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(
      cents / 100,
    );
  } catch {
    return `${Math.round(cents / 100)} ${currency}`;
  }
}

/** YYYY-MM-DD rendered in the UI language, without timezone drift (dates are calendar days, not instants). */
export function formatDate(iso: string, language: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function formatPercent(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value) + '%';
}

/** Common currencies offered in the loan form; any 3-letter ISO code can still be typed. */
export const COMMON_CURRENCIES = ['USD', 'PEN', 'EUR', 'MXN', 'COP', 'CLP', 'ARS', 'BRL', 'GBP'];

/** Groups totals by currency — amounts in different currencies are never summed together. */
export function byCurrency<T extends { currency: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.currency) ?? [];
    list.push(item);
    map.set(item.currency, list);
  }
  return map;
}
