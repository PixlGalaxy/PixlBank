import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { investmentsApi, type AccrualStart, type Investment, type MovementInput } from '../../api/investments';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { todayIso } from '../../lib/money';
import Modal from '../ui/Modal';
import Segmented from '../ui/Segmented';
import { btn, errorBox, input, label } from '../ui/styles';

/** Money added to (or taken out of) an investment, and from when it counts for interest. */
const MovementFormModal = ({ investment, onClose, onSaved }: { investment: Investment; onClose: () => void; onSaved: (i: Investment) => void }) => {
  const { t } = useI18n();
  const [kind, setKind] = useState<MovementInput['kind']>('contribution');
  const [movedOn, setMovedOn] = useState(() => {
    const now = todayIso();
    return now < investment.start_on ? investment.start_on : investment.end_on && now > investment.end_on ? investment.end_on : now;
  });
  const [amount, setAmount] = useState('');
  const [accrual, setAccrual] = useState<AccrualStart>('same_day');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      onSaved(
        await investmentsApi.addMovement(investment.id, {
          kind,
          movedOn,
          amount: Number(amount.replace(',', '.')),
          accrual,
          note: note.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('investments.addMovement')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className={errorBox}>{error}</div>}

        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'contribution', labelKey: 'investments.contribution' },
            { value: 'withdrawal', labelKey: 'investments.withdrawal' },
          ]}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="mv-amount">
              {t('investments.amount', { currency: investment.currency })}
            </label>
            <input
              id="mv-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={input}
              autoFocus
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="mv-date">
              {t('investments.date')}
            </label>
            <input
              id="mv-date"
              type="date"
              value={movedOn}
              min={investment.start_on}
              max={investment.end_on ?? undefined}
              onChange={(e) => setMovedOn(e.target.value)}
              className={input}
              required
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className={label}>{t(kind === 'withdrawal' ? 'investments.accrualWithdrawal' : 'investments.accrualContribution')}</legend>
          {(['same_day', 'month_end'] as const).map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                accrual === option
                  ? 'border-[var(--accent-500)] bg-[var(--accent-50)] dark:bg-[var(--accent-500)]/10'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="accrual"
                checked={accrual === option}
                onChange={() => setAccrual(option)}
                className="mt-0.5 text-[var(--accent-600)] focus:ring-[var(--accent-500)]"
              />
              <span>
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {t(option === 'same_day' ? 'investments.accrualSameDay' : 'investments.accrualMonthEnd')}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {t(option === 'same_day' ? 'investments.accrualSameDayHint' : 'investments.accrualMonthEndHint')}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <label className={label} htmlFor="mv-note">
            {t('payments.note')}
          </label>
          <input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} className={input} maxLength={500} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={btn.secondary}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className={btn.primary}>
            {saving && <Loader2 className="animate-spin" size={16} />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default MovementFormModal;
