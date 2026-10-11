import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { loansApi, type LoanDetail } from '../../api/loans';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { formatMoney, todayIso } from '../../lib/money';
import Modal from '../ui/Modal';
import { btn, errorBox, input, label } from '../ui/styles';

/** The lender records a payment received outside the app (cash, their own bank app...). Approved immediately. */
const ManualPaymentModal = ({ loan, onClose, onSaved }: { loan: LoanDetail; onClose: () => void; onSaved: () => void }) => {
  const { t, language } = useI18n();
  const next = loan.summary.nextInstallment;
  const [amount, setAmount] = useState(next ? String(next.amountDueCents / 100) : '');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await loansApi.addPayment(loan.id, { amount: Number(amount.replace(',', '.')), paidOn, note: note || undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('payments.registerTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className={errorBox}>{error}</div>}
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('payments.registerHint', {
            loan: loan.title,
            remaining: formatMoney(loan.summary.remainingCents, loan.currency, language),
          })}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="mp-amount">
              {t('payments.amount', { currency: loan.currency })}
            </label>
            <input
              id="mp-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={input}
              required
              autoFocus
            />
          </div>
          <div>
            <label className={label} htmlFor="mp-date">
              {t('payments.paidOn')}
            </label>
            <input
              id="mp-date"
              type="date"
              value={paidOn}
              max={todayIso()}
              onChange={(e) => setPaidOn(e.target.value)}
              className={input}
              required
            />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="mp-note">
            {t('payments.note')}
          </label>
          <input id="mp-note" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={btn.secondary}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className={btn.primary}>
            {saving && <Loader2 className="animate-spin" size={16} />}
            {t('payments.register')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ManualPaymentModal;
