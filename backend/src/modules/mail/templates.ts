import type { EmailKey, EmailTranslate } from '../../i18n/index.js';

/** Every kind of email PixlBank sends — also the `kind` recorded in email_log. */
export const EMAIL_KINDS = [
  'reminder-upcoming',
  'reminder-due',
  'reminder-overdue',
  'payment-received',
  'payment-approved',
  'payment-rejected',
  'admin-payment-review',
  'admin-receipt-suspicious',
  'test',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export function isEmailKind(value: unknown): value is EmailKind {
  return EMAIL_KINDS.includes(value as EmailKind);
}

/** What the lender can edit for each kind and language. */
export interface EmailTemplate {
  subject: string;
  title: string;
  message: string;
  button: string;
  smallPrint: string;
}

export const TEMPLATE_FIELDS = ['subject', 'title', 'message', 'button', 'smallPrint'] as const;
const FIELD_MAX: Record<keyof EmailTemplate, number> = { subject: 200, title: 200, message: 4000, button: 80, smallPrint: 1000 };

/** Locale key prefix of each kind's built-in texts (email.<prefix>.subject / .title / .body). */
const PREFIX: Record<EmailKind, string> = {
  'reminder-upcoming': 'reminderUpcoming',
  'reminder-due': 'reminderDue',
  'reminder-overdue': 'reminderOverdue',
  'payment-received': 'paymentReceived',
  'payment-approved': 'paymentApproved',
  'payment-rejected': 'paymentRejected',
  'admin-payment-review': 'adminPaymentReview',
  'admin-receipt-suspicious': 'adminReceiptRejected',
  test: 'test',
};

/**
 * The placeholders each kind fills in, with the sample values used by the
 * preview and the test emails. {app} and {name} are available everywhere.
 */
export const SAMPLE_VARS: Record<EmailKind, Record<string, string>> = {
  'reminder-upcoming': {
    loan: 'Moto SRK 450',
    number: '3',
    total: '24',
    amount: 'S/ 1,014.00',
    date: '2026-12-02',
    remaining: 'S/ 22,308.07',
  },
  'reminder-due': {
    loan: 'Moto SRK 450',
    number: '3',
    total: '24',
    amount: 'S/ 1,014.00',
    date: '2026-12-02',
    remaining: 'S/ 22,308.07',
  },
  'reminder-overdue': {
    loan: 'Moto SRK 450',
    number: '3',
    total: '24',
    date: '2026-12-02',
    overdue: 'S/ 1,014.00',
    remaining: 'S/ 22,308.07',
  },
  'payment-received': { loan: 'Moto SRK 450', amount: 'S/ 1,014.00', date: '2026-12-01' },
  'payment-approved': { loan: 'Moto SRK 450', amount: 'S/ 1,014.00', date: '2026-12-01', remaining: 'S/ 21,294.07' },
  'payment-rejected': {
    loan: 'Moto SRK 450',
    amount: 'S/ 1,014.00',
    date: '2026-12-01',
    remaining: 'S/ 22,308.07',
    reason: 'El comprobante no muestra el monto completo.',
  },
  'admin-payment-review': {
    loan: 'Moto SRK 450',
    debtor: 'Ana',
    amount: 'S/ 1,014.00',
    date: '2026-12-01',
    score: '82%',
    reason: 'La fecha y el monto del comprobante coinciden con el pago.',
  },
  'admin-receipt-suspicious': {
    loan: 'Moto SRK 450',
    debtor: 'Ana',
    amount: 'S/ 1,014.00',
    date: '2026-12-01',
    score: '23%',
    reason: 'El comprobante muestra S/ 104.00, que no coincide con el monto ingresado.',
  },
  test: {},
};

/** The built-in texts, from the locale files. */
export function defaultTemplate(te: EmailTranslate, kind: EmailKind, language: string): EmailTemplate {
  const key = (suffix: string) => `email.${PREFIX[kind]}.${suffix}` as EmailKey;
  return {
    subject: te(language, key('subject')),
    title: te(language, key('title')),
    message: `${te(language, 'email.greeting')}\n${te(language, key('body'))}`,
    button: te(language, 'email.openApp'),
    smallPrint: te(language, 'email.footer'),
  };
}

/** Accepts a stored or submitted template only if every field is a string of sane length. */
export function parseTemplate(value: unknown): EmailTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  for (const field of TEMPLATE_FIELDS) {
    if (typeof v[field] !== 'string' || (v[field] as string).length > FIELD_MAX[field]) return null;
  }
  return {
    subject: v.subject as string,
    title: v.title as string,
    message: v.message as string,
    button: v.button as string,
    smallPrint: v.smallPrint as string,
  };
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Lays a template out as an email: the app name on top, the title, the message
 * (one paragraph per line), a button to the app and the small print. Every
 * value is HTML-escaped after the placeholders are filled in, so neither the
 * lender's text nor a debtor's name can inject markup.
 */
export function renderEmail(
  template: EmailTemplate,
  vars: Record<string, string | number>,
  appName: string,
  appUrl: string,
): { subject: string; title: string; text: string; html: string } {
  const subject = fill(template.subject, vars).replace(/[\r\n]+/g, ' ').trim();
  const title = fill(template.title, vars).trim();
  const lines = fill(template.message, vars).split('\n');
  const button = fill(template.button, vars).trim();
  const smallPrint = fill(template.smallPrint, vars).split('\n').filter((l) => l.trim());
  const showButton = Boolean(button && appUrl);

  const text = [title, '', ...lines, '', showButton ? `${button}: ${appUrl}` : '', '', ...smallPrint]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = lines
    .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line) || '&nbsp;'}</p>`)
    .join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#eef0f4;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 28px;text-align:center">
<div style="font-size:15px;font-weight:700;letter-spacing:.04em;color:#4f46e5;margin-bottom:20px">${escapeHtml(appName)}</div>
${title ? `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#0f172a">${escapeHtml(title)}</h1>` : ''}
<div style="font-size:15px;line-height:1.6;color:#334155">
${paragraphs}
</div>
${showButton ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:12px 26px;background:#0f172a;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(button)}</a></p>` : ''}
${smallPrint.length ? `<div style="margin-top:24px;font-size:12px;line-height:1.5;color:#64748b">${smallPrint.map(escapeHtml).join('<br>')}</div>` : ''}
</div></body></html>`;

  return { subject, title, text, html };
}
