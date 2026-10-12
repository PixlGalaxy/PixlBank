import { useState } from 'react';
import { Check, Eye, Hand, Loader2, Trash2, X } from 'lucide-react';
import { paymentsApi, type Payment } from '../../api/loans';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney } from '../../lib/money';
import { btn, errorBox } from '../ui/styles';
import Modal from '../ui/Modal';
import { AiFlagBadge, AiScoreBadge, PaymentStatusBadge } from './Badges';
import ReceiptModal from './ReceiptModal';

interface Props {
  payments: Payment[];
  currency: string;
  isAdmin: boolean;
  onChanged: () => void;
}

/** Receipt thumbnail, or a hand for payments the lender registered without one. */
const Thumb = ({ payment, onOpen }: { payment: Payment; onOpen: () => void }) =>
  payment.has_receipt ? (
    <button
      type="button"
      onClick={onOpen}
      className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:ring-2 hover:ring-[var(--accent-500)] dark:border-slate-700 dark:bg-slate-800"
    >
      <img src={paymentsApi.receiptUrl(payment.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
    </button>
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      <Hand size={18} />
    </span>
  );

/**
 * Payment history. The lender sees each receipt with the AI's confidence and
 * approves/rejects pending ones right from the row; a debtor sees the lender's
 * decision and the AI only as a color flag.
 */
const PaymentsList = ({ payments, currency, isAdmin, onChanged }: Props) => {
  const { t, language } = useI18n();
  const [viewing, setViewing] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState('');
  const money = (cents: number) => formatMoney(cents, currency, language);

  if (payments.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{t('payments.none')}</p>;
  }

  const run = async (key: string, action: () => Promise<unknown>) => {
    setError('');
    setDeciding(key);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setDeciding(null);
    }
  };

  return (
    <>
      {error && <div className={`${errorBox} mb-3`}>{error}</div>}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {payments.map((p) => {
          const pendingDecision = isAdmin && p.status === 'pending';
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 px-3 py-2.5 ${pendingDecision ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''}`}
            >
              <Thumb payment={p} onOpen={() => setViewing(p)} />
              {/* Badges drop under the amount on narrow screens instead of squeezing it. */}
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="min-w-0">
                  <p className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{money(p.amount_cents)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(p.paid_on, language)}
                    {p.source === 'admin' && <> · {t('payments.sourceAdmin')}</>}
                    {isAdmin && p.status === 'approved' && p.interest_cents > 0 && (
                      <> · {t('payments.interestPart', { amount: money(p.interest_cents) })}</>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.source === 'debtor' &&
                    (isAdmin ? (
                      <AiScoreBadge status={p.ai_status} confidence={p.ai_confidence} />
                    ) : (
                      <AiFlagBadge status={p.ai_status} flag={p.ai_flag} />
                    ))}
                  <PaymentStatusBadge status={p.status} />
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                {pendingDecision && (
                  <>
                    <button
                      type="button"
                      onClick={() => void run(`${p.id}:ok`, () => paymentsApi.review(p.id, 'approved'))}
                      disabled={deciding !== null}
                      className="inline-flex items-center justify-center rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                      title={t('payments.approve')}
                    >
                      {deciding === `${p.id}:ok` ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void run(`${p.id}:no`, () => paymentsApi.review(p.id, 'rejected'))}
                      disabled={deciding !== null}
                      className="inline-flex items-center justify-center rounded-lg p-2 text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
                      title={t('payments.reject')}
                    >
                      {deciding === `${p.id}:no` ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setViewing(p)} className={btn.iconGhost} title={t('payments.details')}>
                  <Eye size={16} />
                </button>
                {isAdmin && (
                  <button type="button" onClick={() => setDeleting(p)} className={btn.iconDanger} title={t('common.delete')}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {viewing && (
        <ReceiptModal
          payment={viewing}
          currency={currency}
          canReview={isAdmin}
          onClose={() => setViewing(null)}
          onChanged={onChanged}
        />
      )}

      {deleting && (
        <Modal title={t('payments.deleteTitle')} onClose={() => setDeleting(null)}>
          <p className="text-slate-600 dark:text-slate-300">
            {t('payments.confirmDelete', { amount: money(deleting.amount_cents), date: formatDate(deleting.paid_on, language) })}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setDeleting(null)} className={btn.secondary}>
              {t('common.cancel')}
            </button>
            <button
              onClick={() =>
                void run('delete', async () => {
                  await paymentsApi.remove(deleting.id);
                  setDeleting(null);
                })
              }
              className={btn.danger}
            >
              <Trash2 size={16} /> {t('common.delete')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};

export default PaymentsList;
