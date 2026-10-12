import { useEffect, useState, type FormEvent } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import {
  loansApi,
  type InterestMethod,
  type LoanDetail,
  type LoanInput,
  type PaymentFrequency,
  type RatePeriod,
  type ScheduledInstallment,
} from '../../api/loans';
import type { User } from '../../api/types';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import { COMMON_CURRENCIES, formatDate, formatMoney, todayIso } from '../../lib/money';
import Modal from '../ui/Modal';
import { btn, errorBox, input, label } from '../ui/styles';

interface Props {
  /** null = new loan. */
  loan: LoanDetail | null;
  /** Debtors to pick from; when only one is passed it's fixed. */
  borrowers: User[];
  onClose: () => void;
  onSaved: (loan: LoanDetail) => void;
}

/** Default first due date: one period after today. */
function nextPeriod(frequency: PaymentFrequency): string {
  const d = new Date();
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + (frequency === 'weekly' ? 7 : 14));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; labelKey: TranslationKey }[];
  onChange: (v: T) => void;
}) => {
  const { t } = useI18n();
  return (
    <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
            value === o.value
              ? 'bg-[var(--accent-600)] text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
};

const LoanFormModal = ({ loan, borrowers, onClose, onSaved }: Props) => {
  const { t, language } = useI18n();
  const isNew = loan === null;

  const [borrowerId, setBorrowerId] = useState(loan?.borrower_id ?? borrowers[0]?.id ?? '');
  const [title, setTitle] = useState(loan?.title ?? '');
  const [currency, setCurrency] = useState(loan?.currency ?? 'USD');
  const [principal, setPrincipal] = useState(loan ? String(loan.principal_cents / 100) : '');
  const [interestRate, setInterestRate] = useState(loan ? String(loan.interest_rate) : '');
  const [noInterest, setNoInterest] = useState(loan?.interest_rate === 0);
  const [keepInterest, setKeepInterest] = useState(loan ? loan.prepay_keeps_interest === 1 : true);
  const [ratePeriod, setRatePeriod] = useState<RatePeriod>(loan?.rate_period ?? 'annual');
  const [interestMethod, setInterestMethod] = useState<InterestMethod>(loan?.interest_method ?? 'french');
  const [frequency, setFrequency] = useState<PaymentFrequency>(loan?.frequency ?? 'monthly');
  const [installmentsCount, setInstallmentsCount] = useState(loan ? String(loan.installments_count) : '12');
  const [disbursedOn, setDisbursedOn] = useState(loan?.disbursed_on ?? todayIso());
  const [firstDueOn, setFirstDueOn] = useState(loan?.first_due_on ?? nextPeriod('monthly'));
  const [notes, setNotes] = useState(loan?.notes ?? '');
  const [cancelled, setCancelled] = useState(loan?.status === 'cancelled');

  const [preview, setPreview] = useState<ScheduledInstallment[] | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const termsInput = {
    principal: Number(principal.replace(',', '.')),
    interestRate: noInterest ? 0 : Number(interestRate.replace(',', '.') || '0'),
    ratePeriod,
    interestMethod,
    frequency,
    installmentsCount: Number(installmentsCount),
    firstDueOn,
  };
  const termsKey = JSON.stringify(termsInput);

  // Live schedule preview, debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const terms = JSON.parse(termsKey) as typeof termsInput;
    if (!(terms.principal > 0) || !(terms.installmentsCount > 0) || !firstDueOn) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      loansApi.preview(terms).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsKey]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body: LoanInput = {
      borrowerId,
      title,
      notes: notes || null,
      currency: currency.toUpperCase(),
      ...termsInput,
      disbursedOn,
      status: cancelled ? 'cancelled' : 'active',
      prepayKeepsInterest: keepInterest,
    };
    try {
      onSaved(loan ? await loansApi.update(loan.id, body) : await loansApi.create(body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const cur = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD';
  const money = (cents: number) => formatMoney(cents, cur, language);
  const totalInterest = preview?.reduce((s, r) => s + r.interestCents, 0) ?? 0;
  const totalDue = preview?.reduce((s, r) => s + r.amountCents, 0) ?? 0;

  return (
    <Modal title={isNew ? t('loans.new') : t('loans.edit')} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-5">
        {error && <div className={errorBox}>{error}</div>}
        {!isNew && loan.payments.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {t('loans.editWithPaymentsHint')}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {borrowers.length > 1 && (
            <div className="sm:col-span-2">
              <label className={label} htmlFor="l-borrower">
                {t('loans.borrower')}
              </label>
              <select id="l-borrower" value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)} className={input} required>
                {borrowers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.display_name ? `${b.display_name} (${b.username})` : b.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className={label} htmlFor="l-title">
              {t('loans.title')}
            </label>
            <input
              id="l-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={input}
              placeholder={t('loans.titlePlaceholder')}
              required
              autoFocus={isNew}
            />
          </div>

          <div>
            <label className={label} htmlFor="l-principal">
              {t('loans.principal')}
            </label>
            <input
              id="l-principal"
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
            <label className={label} htmlFor="l-currency">
              {t('loans.currency')}
            </label>
            <input
              id="l-currency"
              list="l-currencies"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              className={`${input} uppercase`}
              pattern="[A-Za-z]{3}"
              required
            />
            <datalist id="l-currencies">
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">
            <input
              type="checkbox"
              checked={noInterest}
              onChange={(e) => setNoInterest(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]"
            />
            {t('loans.noInterest')}
          </label>

          {/* An interest-free loan just splits the amount evenly — rate, period and method don't apply. */}
          {!noInterest && (
            <>
              <div>
                <label className={label} htmlFor="l-rate">
                  {t('loans.interestRate')}
                </label>
                <div className="relative">
                  <input
                    id="l-rate"
                    type="number"
                    min="0"
                    step="0.01"
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

              <div>
                <span className={label}>{t('loans.method')}</span>
                <Segmented
                  value={interestMethod}
                  onChange={setInterestMethod}
                  options={[
                    { value: 'french', labelKey: 'loans.methodFrench' },
                    { value: 'simple', labelKey: 'loans.methodSimple' },
                  ]}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t(interestMethod === 'french' ? 'loans.methodFrenchHint' : 'loans.methodSimpleHint')}
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={keepInterest}
                    onChange={(e) => setKeepInterest(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]"
                  />
                  {t('loans.prepayKeepsInterest')}
                </label>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t(keepInterest ? 'loans.prepayKeepsInterestHint' : 'loans.prepaySavesInterestHint')}
                </p>
              </div>
            </>
          )}

          <div>
            <span className={label}>{t('loans.frequency')}</span>
            <Segmented
              value={frequency}
              onChange={(f) => {
                setFrequency(f);
                if (isNew) setFirstDueOn(nextPeriod(f));
              }}
              options={[
                { value: 'weekly', labelKey: 'loans.freqWeekly' },
                { value: 'biweekly', labelKey: 'loans.freqBiweekly' },
                { value: 'monthly', labelKey: 'loans.freqMonthly' },
              ]}
            />
          </div>

          <div>
            <label className={label} htmlFor="l-count">
              {t('loans.installmentsCount')}
            </label>
            <input
              id="l-count"
              type="number"
              min="1"
              max="600"
              step="1"
              value={installmentsCount}
              onChange={(e) => setInstallmentsCount(e.target.value)}
              className={input}
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="l-disbursed">
              {t('loans.disbursedOn')}
            </label>
            <input
              id="l-disbursed"
              type="date"
              value={disbursedOn}
              onChange={(e) => setDisbursedOn(e.target.value)}
              className={input}
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="l-first-due">
              {t('loans.firstDueOn')}
            </label>
            <input
              id="l-first-due"
              type="date"
              value={firstDueOn}
              min={disbursedOn}
              onChange={(e) => setFirstDueOn(e.target.value)}
              className={input}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label} htmlFor="l-notes">
              {t('loans.notes')}
            </label>
            <textarea id="l-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} rows={2} />
          </div>

          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">
              <input
                type="checkbox"
                checked={cancelled}
                onChange={(e) => setCancelled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]"
              />
              {t('loans.markCancelled')}
            </label>
          )}
        </div>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Calculator size={16} className="text-[var(--accent-500)]" />
            {t('loans.previewTitle')}
          </h3>
          {preview ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{t('loans.installment')}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(preview[0]!.amountCents)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{t('loans.totalInterest')}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(totalInterest)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{t('loans.totalToPay')}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(totalDue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{t('loans.lastDue')}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatDate(preview[preview.length - 1]!.dueOn, language)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setShowSchedule((v) => !v)}
                className="mt-3 text-xs font-medium text-[var(--accent-600)] hover:underline dark:text-[var(--accent-400)]"
              >
                {showSchedule ? t('loans.hideSchedule') : t('loans.showSchedule')}
              </button>
              {showSchedule && (
                <div className="mt-2 max-h-56 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-1">#</th>
                        <th className="py-1">{t('loans.dueDate')}</th>
                        <th className="py-1 text-right">{t('loans.installment')}</th>
                        <th className="py-1 text-right">{t('charts.principal')}</th>
                        <th className="py-1 text-right">{t('charts.interest')}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums text-slate-700 dark:text-slate-200">
                      {preview.map((r) => (
                        <tr key={r.number} className="border-t border-slate-200 dark:border-slate-700">
                          <td className="py-1">{r.number}</td>
                          <td className="py-1">{formatDate(r.dueOn, language)}</td>
                          <td className="py-1 text-right">{money(r.amountCents)}</td>
                          <td className="py-1 text-right">{money(r.principalCents)}</td>
                          <td className="py-1 text-right">{money(r.interestCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('loans.previewEmpty')}</p>
          )}
        </section>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5 dark:border-slate-700">
          <button type="button" onClick={onClose} className={btn.secondary}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving || !borrowerId} className={btn.primary}>
            {saving && <Loader2 className="animate-spin" size={16} />}
            {isNew ? t('common.create') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default LoanFormModal;
