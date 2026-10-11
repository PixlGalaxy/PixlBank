import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Keys the backend sends to clients. Locale files may hold more (the frontend's). */
const BACKEND_KEYS = [
  'auth.credentialsRequired',
  'auth.invalidCredentials',
  'auth.notAuthenticated',
  'auth.forbidden',
  'auth.passwordsRequired',
  'auth.passwordTooShort',
  'auth.currentPasswordIncorrect',
  'auth.invalidTheme',
  'auth.invalidLanguage',
  'auth.passwordChangeRequired',
  'error.internal',
  'error.notFound',
  'error.tooManyRequests',
  'error.ipBanned',
  'error.crossSiteRequest',
  'error.invalidInput',
  'users.invalidEmail',
  'users.invalidUsername',
  'users.emailTaken',
  'users.usernameTaken',
  'users.cannotDeleteSelf',
  'users.cannotEditAdmin',
  'users.hasLoans',
  'avatars.invalidType',
  'avatars.tooLarge',
  'avatars.noFile',
  'loans.invalidBorrower',
  'loans.invalidTitle',
  'loans.invalidCurrency',
  'loans.invalidAmount',
  'loans.invalidRate',
  'loans.invalidInstallments',
  'loans.invalidDates',
  'loans.notActive',
  'payments.invalidAmount',
  'payments.invalidDate',
  'payments.receiptRequired',
  'payments.receiptInvalidType',
  'payments.receiptTooLarge',
  'payments.exceedsBalance',
  'payments.noReceipt',
  'mail.notConfigured',
  'mail.sendFailed',
  'mail.noEmail',
  'ollama.notConfigured',
  'adminSettings.invalidValue',
  'adminSettings.invalidTrustProxy',
  'adminSettings.unknownService',
  'adminSettings.serviceRestartFailed',
  'ipAccess.invalidIp',
  'ipAccess.alreadyBanned',
  'ipAccess.cannotBanSelf',
  'ipAccess.cannotBanPrivate',
  'ipAccess.unknownSource',
] as const;

export type TranslationKey = (typeof BACKEND_KEYS)[number];
export type Translate = (key: TranslationKey) => string;

export function isLanguage(value: string | undefined): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language);
}

function loadDictionary(localesDir: string, language: Language): Record<string, string> {
  const path = join(localesDir, `${language}.json`);
  const dictionary = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;

  const missing = BACKEND_KEYS.filter((key) => typeof dictionary[key] !== 'string');
  if (missing.length > 0) {
    throw new Error(`Locale ${path} is missing keys: ${missing.join(', ')}`);
  }
  return dictionary;
}

export function createTranslator(localesDir: string, language: Language): Translate {
  const dictionary = loadDictionary(localesDir, language);
  logger.info(`Loaded ${language} locale from ${localesDir}`);
  return (key) => dictionary[key];
}

/** Keys used to build outgoing emails, in the recipient's own language. */
const EMAIL_KEYS = [
  'email.greeting',
  'email.footer',
  'email.openApp',
  'email.loanLine',
  'email.reminderUpcoming.subject',
  'email.reminderUpcoming.body',
  'email.reminderDue.subject',
  'email.reminderDue.body',
  'email.reminderOverdue.subject',
  'email.reminderOverdue.body',
  'email.paymentApproved.subject',
  'email.paymentApproved.body',
  'email.paymentRejected.subject',
  'email.paymentRejected.body',
  'email.paymentReceived.subject',
  'email.paymentReceived.body',
  'email.adminReceiptRejected.subject',
  'email.adminReceiptRejected.body',
  'email.adminPaymentReview.subject',
  'email.adminPaymentReview.body',
  'email.test.subject',
  'email.test.body',
  'receipt.reason.ok',
  'receipt.reason.not_a_receipt',
  'receipt.reason.no_date',
  'receipt.reason.date_too_old',
  'receipt.reason.date_in_future',
  'receipt.reason.no_amount',
  'receipt.reason.amount_mismatch',
  'receipt.reason.unreachable',
  'receipt.reason.bad_response',
  'receipt.reason.disabled',
  'receipt.reason.manual',
] as const;

export type EmailKey = (typeof EMAIL_KEYS)[number];
export type EmailTranslate = (language: string, key: EmailKey, vars?: Record<string, string | number>) => string;

/** Loads every language at once: emails go out in each recipient's language, not the server's. */
export function createEmailTranslator(localesDir: string): EmailTranslate {
  const dictionaries = Object.fromEntries(
    SUPPORTED_LANGUAGES.map((language) => {
      const path = join(localesDir, `${language}.json`);
      const dictionary = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;
      const missing = EMAIL_KEYS.filter((key) => typeof dictionary[key] !== 'string');
      if (missing.length > 0) throw new Error(`Locale ${path} is missing keys: ${missing.join(', ')}`);
      return [language, dictionary];
    }),
  ) as Record<Language, Record<string, string>>;

  return (language, key, vars) => {
    const template = dictionaries[isLanguage(language) ? language : 'en'][key]!;
    if (!vars) return template;
    return Object.entries(vars).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), template);
  };
}
