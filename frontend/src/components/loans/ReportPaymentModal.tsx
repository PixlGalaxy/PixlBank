import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';
import { paymentsApi, type LoanDetail } from '../../api/loans';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { formatMoney, todayIso } from '../../lib/money';
import Modal from '../ui/Modal';
import { btn, errorBox, input, label } from '../ui/styles';

const ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * The debtor reports a payment: amount, date and a picture of the receipt.
 * Sending only uploads it — the AI check runs afterwards on the server and the
 * lender decides — so the modal closes right away and the payment shows up in
 * the history as "under review".
 */
const ReportPaymentModal = ({ loan, onClose, onSent }: { loan: LoanDetail; onClose: () => void; onSent: () => void }) => {
  const { t, language } = useI18n();
  const { receiptMaxAgeDays } = useAppConfig();
  const next = loan.summary.nextInstallment;
  const [amount, setAmount] = useState(next ? String(next.amountDueCents / 100) : '');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError(t('payments.receiptMissing'));
      return;
    }
    setError('');
    setSending(true);
    try {
      await paymentsApi.report({
        loanId: loan.id,
        amount: Number(amount.replace(',', '.')),
        paidOn,
        note: note || undefined,
        receipt: file,
      });
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title={t('payments.reportTitle')} onClose={sending ? () => undefined : onClose} dismissible={!sending}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className={errorBox}>{error}</div>}

        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('payments.reportHint', {
            loan: loan.title,
            remaining: formatMoney(loan.summary.remainingCents, loan.currency, language),
          })}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="rp-amount">
              {t('payments.amount', { currency: loan.currency })}
            </label>
            <input
              id="rp-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={input}
              required
              disabled={sending}
            />
          </div>
          <div>
            <label className={label} htmlFor="rp-date">
              {t('payments.paidOn')}
            </label>
            <input
              id="rp-date"
              type="date"
              value={paidOn}
              max={todayIso()}
              onChange={(e) => setPaidOn(e.target.value)}
              className={input}
              required
              disabled={sending}
            />
          </div>
        </div>

        <div>
          <span className={label}>{t('payments.receipt')}</span>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={sending}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 transition hover:border-[var(--accent-500)] hover:text-[var(--accent-600)] dark:border-slate-600 dark:text-slate-400"
          >
            {previewUrl ? (
              <img src={previewUrl} alt={t('payments.receiptAlt')} className="max-h-48 rounded object-contain" />
            ) : (
              <ImageUp size={28} />
            )}
            <span>{file ? file.name : t('payments.pickReceipt')}</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t('payments.receiptRules', { days: receiptMaxAgeDays })}
          </p>
        </div>

        <div>
          <label className={label} htmlFor="rp-note">
            {t('payments.note')}
          </label>
          <input id="rp-note" value={note} onChange={(e) => setNote(e.target.value)} className={input} disabled={sending} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={sending} className={btn.secondary}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={sending || !file} className={btn.primary}>
            {sending && <Loader2 className="animate-spin" size={16} />}
            {t('payments.send')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReportPaymentModal;
