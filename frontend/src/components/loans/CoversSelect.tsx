import type { LoanDetail } from '../../api/loans';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney } from '../../lib/money';
import { input, label } from '../ui/styles';

interface CoverOption {
  number: number;
  dueOn: string;
  /** What's left on every unpaid installment up to and including this one. */
  totalCents: number;
}

/** "Up to installment N" choices: each unpaid installment with the running total needed to get there. */
function coverOptions(loan: LoanDetail): CoverOption[] {
  let total = 0;
  return loan.installments
    .filter((inst) => inst.state !== 'paid')
    .map((inst) => {
      total += inst.remaining_cents;
      return { number: inst.number, dueOn: inst.due_on, totalCents: total };
    });
}

interface Props {
  id: string;
  loan: LoanDetail;
  /** Installment number, or null for "by payment date". */
  value: number | null;
  /** Entered amount in cents (NaN while the field is empty). */
  amountCents: number;
  disabled?: boolean;
  onChange: (value: number | null, totalCents: number | null) => void;
}

/**
 * Which installments a payment settles. Picking one fills in the amount and
 * marks them paid on the payment's date — so an installment handed over before
 * its month counts as paid (early) instead of being spread as a prepayment.
 */
const CoversSelect = ({ id, loan, value, amountCents, disabled, onChange }: Props) => {
  const { t, language } = useI18n();
  const options = coverOptions(loan);
  if (options.length === 0) return null;
  const selected = options.find((o) => o.number === value);
  const extra = selected && Number.isFinite(amountCents) ? amountCents - selected.totalCents : 0;

  return (
    <div>
      <label className={label} htmlFor={id}>
        {t('payments.covers')}
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const picked = options.find((o) => String(o.number) === e.target.value);
          onChange(picked?.number ?? null, picked?.totalCents ?? null);
        }}
        className={input}
      >
        {options.map((o) => (
          <option key={o.number} value={o.number}>
            {t('payments.coversOption', {
              n: o.number,
              date: formatDate(o.dueOn, language),
              amount: formatMoney(o.totalCents, loan.currency, language),
            })}
          </option>
        ))}
        <option value="">{t('payments.coversAuto')}</option>
      </select>
      {selected && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {extra > 0
            ? t('payments.coversExtra', { amount: formatMoney(extra, loan.currency, language) })
            : t('payments.coversHint')}
        </p>
      )}
    </div>
  );
};

export default CoversSelect;
