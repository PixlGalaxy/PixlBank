import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { investmentsApi, type Investment, type InvestmentInput } from '../../api/investments';
import type { RatePeriod } from '../../api/loans';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { COMMON_CURRENCIES, todayIso } from '../../lib/money';
import Modal from '../ui/Modal';
import Segmented from '../ui/Segmented';
import { btn, errorBox, input, label } from '../ui/styles';

interface Props {
  /** null = new investment. */
  investment: Investment | null;
  ownerId: string;
  onClose: () => void;
  onSaved: (investment: Investment) => void;
}

/** Starting capital, rate and dates — the movements come later, one by one. */
const InvestmentFormModal = ({ investment, ownerId, onClose, onSaved }: Props) => {
  const { t } = useI18n();
  const isNew = investment === null;
  const [title, setTitle] = useState(investment?.title ?? '');
  const [currency, setCurrency] = useState(investment?.currency ?? 'PEN');
  const [principal, setPrincipal] = useState(investment ? String(investment.principal_cents / 100) : '');
  const [interestRate, setInterestRate] = useState(investment ? String(investment.interest_rate) : '');
  const [ratePeriod, setRatePeriod] = useState<RatePeriod>(investment?.rate_period ?? 'annual');
  const [startOn, setStartOn] = useState(investment?.start_on ?? todayIso());
  const [endOn, setEndOn] = useState(investment?.end_on ?? '');
  const [notes, setNotes] = useState(investment?.notes ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body: InvestmentInput = {
      ownerId,
      title: title.trim(),
      notes: notes.trim() || null,
      currency: currency.toUpperCase(),
      principal: Number(principal.replace(',', '.')),
      interestRate: Number(interestRate.replace(',', '.') || '0'),
      ratePeriod,
      startOn,
      endOn: endOn || null,
    };
    try {
      onSaved(investment ? await investmentsApi.update(investment.id, body) : await investmentsApi.create(body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t(isNew ? 'investments.new' : 'investments.edit')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className={errorBox}>{error}</div>}
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('investments.formHint')}</p>

        <div>
          <label className={label} htmlFor="inv-title">
            {t('investments.title')}
          </label>
          <input id="inv-title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} maxLength={120} required />
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div>
            <label className={label} htmlFor="inv-principal">
              {t('investments.principal')}
            </label>
            <input
              id="inv-principal"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className={input}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="inv-currency">
              {t('loans.currency')}
            </label>
            <input
              id="inv-currency"
              list="inv-currencies"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              className={`${input} uppercase`}
              pattern="[A-Za-z]{3}"
              required
            />
            <datalist id="inv-currencies">
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="inv-rate">
              {t('investments.rate')}
            </label>
            <div className="relative">
              <input
                id="inv-rate"
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className={`${input} pr-8`}
                required
              />
              <span className="absolute right-3 top-2 text-sm text-slate-400">%</span>
            </div>
          </div>
          <div>
            <span className={label}>{t('loans.ratePeriod')}</span>
            <Segmented
              value={ratePeriod}
              onChange={setRatePeriod}
              options={[
                { value: 'annual', labelKey: 'loans.rateAnnual' },
                { value: 'monthly', labelKey: 'loans.rateMonthly' },
              ]}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">{t('investments.rateHint')}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="inv-start">
              {t('investments.startOn')}
            </label>
            <input id="inv-start" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} className={input} required />
          </div>
          <div>
            <label className={label} htmlFor="inv-end">
              {t('investments.endOn')}
            </label>
            <input id="inv-end" type="date" value={endOn} min={startOn} onChange={(e) => setEndOn(e.target.value)} className={input} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('investments.endOnHint')}</p>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="inv-notes">
            {t('loans.notes')}
          </label>
          <textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} maxLength={2000} />
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

export default InvestmentFormModal;
