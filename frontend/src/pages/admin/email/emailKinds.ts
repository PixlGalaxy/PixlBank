import type { EmailKind } from '../../../api/admin';

/** Every kind of email, in the order the Admin Panel lists them. */
export const EMAIL_KINDS: EmailKind[] = [
  'reminder-upcoming',
  'reminder-due',
  'reminder-overdue',
  'payment-received',
  'payment-approved',
  'payment-rejected',
  'admin-payment-review',
  'admin-receipt-suspicious',
  'test',
];
