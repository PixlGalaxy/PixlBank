import type { Installment } from '../../api/loans';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney } from '../../lib/money';
import { InstallmentStateBadge } from './Badges';

/** The amortization schedule with what has been applied to each installment so far. */
const InstallmentsTable = ({ installments, currency }: { installments: Installment[]; currency: string }) => {
  const { t, language } = useI18n();
  const money = (cents: number) => formatMoney(cents, currency, language);
  const totals = installments.reduce(
    (acc, i) => ({
      amount: acc.amount + i.amount_cents,
      principal: acc.principal + i.principal_cents,
      interest: acc.interest + i.interest_cents,
      paid: acc.paid + i.paid_cents,
    }),
    { amount: 0, principal: 0, interest: 0, paid: 0 },
  );

  const th = 'px-3 py-2 font-medium';
  const td = 'px-3 py-2 tabular-nums';

  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <tr>
            <th className={th}>#</th>
            <th className={th}>{t('loans.dueDate')}</th>
            <th className={`${th} text-right`}>{t('loans.installment')}</th>
            <th className={`${th} text-right`}>{t('charts.principal')}</th>
            <th className={`${th} text-right`}>{t('charts.interest')}</th>
            <th className={`${th} text-right`}>{t('charts.paid')}</th>
            <th className={th}>{t('loans.status')}</th>
          </tr>
        </thead>
        <tbody>
          {installments.map((i) => (
            <tr key={i.id} className="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200">
              <td className={`${td} text-slate-500`}>{i.number}</td>
              <td className={td}>{formatDate(i.due_on, language)}</td>
              <td className={`${td} text-right font-medium`}>{money(i.amount_cents)}</td>
              <td className={`${td} text-right`}>{money(i.principal_cents)}</td>
              <td className={`${td} text-right`}>{money(i.interest_cents)}</td>
              <td className={`${td} text-right`}>{money(i.paid_cents)}</td>
              <td className="px-3 py-2">
                <InstallmentStateBadge state={i.state} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-slate-50 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100">
          <tr>
            <td className={td} colSpan={2}>
              {t('charts.total')}
            </td>
            <td className={`${td} text-right`}>{money(totals.amount)}</td>
            <td className={`${td} text-right`}>{money(totals.principal)}</td>
            <td className={`${td} text-right`}>{money(totals.interest)}</td>
            <td className={`${td} text-right`}>{money(totals.paid)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default InstallmentsTable;
