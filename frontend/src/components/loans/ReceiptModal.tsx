import { useState, type ReactNode } from 'react';
import { Bot, CircleCheck, CircleX, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { paymentsApi, type Payment } from '../../api/loans';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { formatDate, formatMoney } from '../../lib/money';
import { reasonText } from '../../lib/receipt';
import Modal from '../ui/Modal';
import { btn, errorBox, input, label } from '../ui/styles';
import { AiFlagBadge, AiScoreBadge, PaymentStatusBadge } from './Badges';
import ReceiptMetadataPanel from './ReceiptMetadataPanel';

interface Props {
  payment: Payment;
  currency: string;
  /** Admin view: AI score and details, approve/reject/re-check actions. */
  canReview: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** The stored receipt next to what the vision model read off it, and the lender's call. */
const ReceiptModal = ({ payment, currency, canReview, onClose, onChanged }: Props) => {
  const { t, language } = useI18n();
  const { receiptMaxAgeDays } = useAppConfig();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | 'verify' | null>(null);
  const [error, setError] = useState('');
  const money = (cents: number) => formatMoney(cents, currency, language);

  const run = async (kind: 'approve' | 'reject' | 'verify') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'verify') await paymentsApi.verify(payment.id);
      else await paymentsApi.review(payment.id, kind === 'approve' ? 'approved' : 'rejected', note || undefined);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setBusy(null);
    }
  };

  const row = (name: string, value: ReactNode, highlight = false) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-slate-500 dark:text-slate-400">{name}</dt>
      <dd className={`text-right font-medium ${highlight ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </dd>
    </div>
  );

  const amountDiffers = payment.ai_amount_cents !== null && payment.ai_amount_cents !== payment.amount_cents;
  const dateDiffers = payment.ai_date !== null && payment.ai_date !== payment.paid_on;

  return (
    <Modal title={t('payments.receiptTitle')} onClose={onClose} size="lg">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          {payment.has_receipt ? (
            <a href={paymentsApi.receiptUrl(payment.id)} target="_blank" rel="noreferrer" className="group block">
              <img
                src={paymentsApi.receiptUrl(payment.id)}
                alt={t('payments.receiptAlt')}
                className="max-h-[65vh] w-full rounded-lg border border-slate-200 bg-slate-50 object-contain dark:border-slate-700 dark:bg-slate-800"
              />
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent-600)] group-hover:underline dark:text-[var(--accent-400)]">
                <ExternalLink size={12} /> {t('payments.openOriginal')}
              </span>
            </a>
          ) : (
            <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {t('payments.noReceipt')}
            </p>
          )}
        </div>

        <div className="space-y-4 text-sm">
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            {row(t('payments.declaredAmount'), money(payment.amount_cents))}
            {row(t('payments.paidOn'), formatDate(payment.paid_on, language))}
            {row(t('loans.status'), <PaymentStatusBadge status={payment.status} />)}
            {payment.note && row(t('payments.note'), <span className="font-normal">{payment.note}</span>)}
          </dl>

          {payment.source === 'debtor' && canReview && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                  <Bot size={16} className="text-[var(--accent-500)]" /> {t('payments.aiTitle')}
                </span>
                <AiScoreBadge status={payment.ai_status} confidence={payment.ai_confidence} large />
              </div>
              <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                {row(
                  t('payments.detectedAmount'),
                  payment.ai_amount_cents === null ? '—' : money(payment.ai_amount_cents),
                  amountDiffers,
                )}
                {row(t('payments.detectedDate'), payment.ai_date ? formatDate(payment.ai_date, language) : '—', dateDiffers)}
                {payment.ai_model && row(t('payments.aiModel'), <code className="text-xs">{payment.ai_model}</code>)}
              </dl>
              {payment.ai_reason && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {reasonText(t, language, payment.ai_reason, {
                    detectedAmountCents: payment.ai_amount_cents,
                    detectedDate: payment.ai_date,
                    maxAgeDays: receiptMaxAgeDays,
                    currency,
                  })}
                </p>
              )}
              {payment.ai_notes && (
                <p className="mt-1.5 text-xs italic text-slate-500 dark:text-slate-400">“{payment.ai_notes}”</p>
              )}
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{t('payments.aiAdvisory')}</p>
            </div>
          )}

          {canReview && payment.receipt_meta && <ReceiptMetadataPanel meta={payment.receipt_meta} paidOn={payment.paid_on} />}

          {payment.source === 'debtor' && !canReview && payment.ai_flag && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-300">{t('aiScore.flagHint')}</span>
              <AiFlagBadge status={payment.ai_status} flag={payment.ai_flag} />
            </div>
          )}

          {payment.review_note && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <span className="font-medium">{t('payments.reviewNote')}:</span> {payment.review_note}
            </p>
          )}

          {error && <div className={errorBox}>{error}</div>}

          {canReview && (
            <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div>
                <label className={label} htmlFor="review-note">
                  {t('payments.reviewNoteLabel')}
                </label>
                <input
                  id="review-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={input}
                  placeholder={t('payments.reviewNotePlaceholder')}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {payment.status !== 'approved' && (
                  <button type="button" onClick={() => void run('approve')} disabled={busy !== null} className={btn.success}>
                    {busy === 'approve' ? <Loader2 className="animate-spin" size={16} /> : <CircleCheck size={16} />}
                    {t('payments.approve')}
                  </button>
                )}
                {payment.status !== 'rejected' && (
                  <button type="button" onClick={() => void run('reject')} disabled={busy !== null} className={btn.danger}>
                    {busy === 'reject' ? <Loader2 className="animate-spin" size={16} /> : <CircleX size={16} />}
                    {t('payments.reject')}
                  </button>
                )}
                {payment.has_receipt && payment.ai_status !== 'pending' && (
                  <button type="button" onClick={() => void run('verify')} disabled={busy !== null} className={btn.secondary}>
                    {busy === 'verify' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    {t('payments.reverify')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ReceiptModal;
