import type { EnvConfig } from '../../config/env.js';
import type { SettingsService } from '../../db/settings.js';
import { SETTINGS_KEYS } from '../admin/settings-keys.js';
import { daysBetween, isIsoDate, today } from '../loans/dates.js';
import { logger } from '../../logger.js';

export interface OllamaConfig {
  enabled: boolean;
  url: string;
  model: string;
  timeoutSeconds: number;
  maxAgeDays: number;
  /** Percent. */
  amountTolerance: number;
}

/** What the model read off the image. It never decides anything itself — see `score`. */
export interface ReceiptExtraction {
  is_receipt: boolean;
  amount: number | null;
  currency: string | null;
  date: string | null;
  reference: string | null;
  /** 0-100: the model's own confidence that this is a genuine, unedited receipt read correctly. */
  confidence: number | null;
  notes: string | null;
}

export type ReasonCode =
  | 'ok'
  | 'not_a_receipt'
  | 'no_date'
  | 'date_too_old'
  | 'date_in_future'
  | 'no_amount'
  | 'amount_mismatch'
  | 'unreachable'
  | 'bad_response'
  | 'disabled';

/**
 * Advice for the lender, never a verdict: `checksPassed` says whether the
 * date/amount rules held, `confidence` folds that into one 0-100 score.
 */
export type Verification =
  | {
      outcome: 'scored';
      checksPassed: boolean;
      reason: ReasonCode;
      confidence: number;
      extraction: ReceiptExtraction;
      amountCents: number | null;
      raw: string;
      model: string;
    }
  | { outcome: 'error' | 'disabled'; reason: ReasonCode; raw?: string; model?: string };

/** JSON schema handed to Ollama's structured-output `format`, so the reply is always parseable. */
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    is_receipt: { type: 'boolean' },
    amount: { type: ['number', 'null'] },
    currency: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    reference: { type: ['string', 'null'] },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    notes: { type: ['string', 'null'] },
  },
  required: ['is_receipt', 'amount', 'currency', 'date', 'reference', 'confidence', 'notes'],
};

function prompt(now: string): string {
  return [
    'You are helping a lender check proof of a money transfer or payment (a bank transfer confirmation, a mobile',
    'wallet screenshot such as Yape/Plin/Zelle/PayPal, a deposit slip or a store receipt).',
    'Read the image carefully and extract:',
    '- is_receipt: true only if the image really is a proof of payment/transfer.',
    '- amount: the total amount paid or transferred, as a plain number with "." as decimal separator and no',
    '  thousands separators (e.g. "S/ 1.250,50" -> 1250.5). Ignore balances, fees and account numbers.',
    '- currency: ISO 4217 code if it can be inferred (e.g. PEN for "S/", USD for "$" in a US bank), else null.',
    '- date: the date of the operation in YYYY-MM-DD format. Today is ' + now + '; if the year is not printed,',
    '  assume the most recent such date not after today.',
    '- reference: the operation/transaction number if visible, else null.',
    '- confidence: an integer 0-100 for how sure you are that this is a genuine, unedited proof of payment AND',
    '  that you read the amount and date correctly. Lower it for blur, cropping, signs of editing, inconsistent',
    '  fonts, or anything that looks fake.',
    '- notes: one short sentence about anything unusual, else null.',
    'If a value is not visible, use null. Never guess numbers that are not printed.',
  ].join('\n');
}

/** A failed rule caps the score, so a receipt that doesn't match never looks trustworthy, however sure the model was. */
const CAP: Record<ReasonCode, number> = {
  ok: 100,
  not_a_receipt: 5,
  amount_mismatch: 15,
  date_too_old: 20,
  date_in_future: 20,
  no_date: 35,
  no_amount: 35,
  unreachable: 0,
  bad_response: 0,
  disabled: 0,
};

export class ReceiptVerifier {
  constructor(private settings: SettingsService, private config: EnvConfig) {}

  getConfig(): OllamaConfig {
    const s = this.settings;
    const url = s.getString(SETTINGS_KEYS.ollamaUrl, this.config.OLLAMA_URL ?? '').replace(/\/+$/, '');
    return {
      enabled: s.getBoolean(SETTINGS_KEYS.ollamaEnabled, Boolean(this.config.OLLAMA_URL)),
      url,
      model: s.getString(SETTINGS_KEYS.ollamaModel, this.config.OLLAMA_MODEL),
      timeoutSeconds: s.getNumber(SETTINGS_KEYS.ollamaTimeoutSeconds, 180),
      maxAgeDays: s.getNumber(SETTINGS_KEYS.receiptMaxAgeDays, 5),
      amountTolerance: s.getNumber(SETTINGS_KEYS.receiptAmountTolerance, 1),
    };
  }

  isConfigured(): boolean {
    const c = this.getConfig();
    return c.enabled && Boolean(c.url) && Boolean(c.model);
  }

  /** For the settings page's "test connection": the models the server has pulled. */
  async listModels(urlOverride?: string): Promise<string[]> {
    const url = (urlOverride || this.getConfig().url).replace(/\/+$/, '');
    if (!url) throw new Error('No Ollama URL configured');
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
    const body = (await res.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((m) => m.name);
  }

  private async extract(c: OllamaConfig, image: Buffer): Promise<{ extraction: ReceiptExtraction; raw: string }> {
    const res = await fetch(`${c.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(c.timeoutSeconds * 1000),
      body: JSON.stringify({
        model: c.model,
        stream: false,
        format: EXTRACTION_SCHEMA,
        options: { temperature: 0 },
        messages: [{ role: 'user', content: prompt(today()), images: [image.toString('base64')] }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { message?: { content?: string } };
    const raw = body.message?.content ?? '';
    const parsed = JSON.parse(raw) as Partial<ReceiptExtraction>;
    const confidence = Number(parsed.confidence);
    return {
      raw,
      extraction: {
        is_receipt: parsed.is_receipt === true,
        amount: typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) ? parsed.amount : null,
        currency: typeof parsed.currency === 'string' ? parsed.currency : null,
        date: typeof parsed.date === 'string' ? parsed.date.slice(0, 10) : null,
        reference: typeof parsed.reference === 'string' ? parsed.reference : null,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : null,
        notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim().slice(0, 500) : null,
      },
    };
  }

  /**
   * The rules, applied in code rather than left to the model: it's a receipt,
   * it's dated within the last `maxAgeDays` days (and not in the future), and
   * its amount matches what the debtor declared within `amountTolerance`%.
   */
  check(c: OllamaConfig, extraction: ReceiptExtraction, declaredCents: number): ReasonCode {
    if (!extraction.is_receipt) return 'not_a_receipt';
    if (!extraction.date || !isIsoDate(extraction.date)) return 'no_date';
    const age = daysBetween(extraction.date, today());
    // One day of slack for receipts issued in a timezone ahead of the server.
    if (age < -1) return 'date_in_future';
    if (age > c.maxAgeDays) return 'date_too_old';
    if (extraction.amount === null) return 'no_amount';
    const detected = Math.round(extraction.amount * 100);
    const tolerance = Math.max(1, Math.round((declaredCents * c.amountTolerance) / 100));
    if (Math.abs(detected - declaredCents) > tolerance) return 'amount_mismatch';
    return 'ok';
  }

  async verify(image: Buffer, declaredCents: number): Promise<Verification> {
    const c = this.getConfig();
    if (!this.isConfigured()) return { outcome: 'disabled', reason: 'disabled' };

    let result: { extraction: ReceiptExtraction; raw: string };
    try {
      result = await this.extract(c, image);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Receipt verification with ${c.model} failed: ${message}`);
      return {
        outcome: 'error',
        reason: err instanceof SyntaxError ? 'bad_response' : 'unreachable',
        raw: message,
        model: c.model,
      };
    }

    const reason = this.check(c, result.extraction, declaredCents);
    // A model that didn't rate itself is treated as middling, never as certain.
    const modelScore = result.extraction.confidence ?? 60;
    return {
      outcome: 'scored',
      checksPassed: reason === 'ok',
      reason,
      confidence: Math.min(modelScore, CAP[reason]),
      extraction: result.extraction,
      amountCents: result.extraction.amount === null ? null : Math.round(result.extraction.amount * 100),
      raw: result.raw,
      model: c.model,
    };
  }
}
