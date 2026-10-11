import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, ChevronRight, Hourglass, Loader2, PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import { loansApi, type LoanDetail } from '../../api/loans';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { byCurrency, formatDate, formatMoney, formatPercent } from '../../lib/money';
import { cumulativeProgress, monthlyCollections, totalsFor } from '../../lib/loanStats';
import StatTile from '../../components/charts/StatTile';
import CollectionsChart from '../../components/charts/CollectionsChart';
import ProgressChart from '../../components/charts/ProgressChart';
import BalanceMeter from '../../components/charts/BalanceMeter';
import CurrencyTabs from '../../components/loans/CurrencyTabs';
import { AiScoreBadge, LoanStateBadge } from '../../components/loans/Badges';
import { usePollWhileAnalyzing } from '../../hooks/usePollWhileAnalyzing';
import Avatar from '../../components/ui/Avatar';
import { btn, card, errorBox } from '../../components/ui/styles';

/** The lender's dashboard: every loan they've made, what it has returned and what's still out. */
const AdminHome = () => {
  const { t, language } = useI18n();
  const [loans, setLoans] = useState<LoanDetail[] | null>(null);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState('');

  const load = useCallback(async () => {
    try {
      setLoans(await loansApi.listDetailed());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);
  usePollWhileAnalyzing(loans, load);

  const groups = useMemo(() => byCurrency(loans ?? []), [loans]);
  const currencies = [...groups.keys()];
  const active = currencies.includes(currency) ? currency : (currencies[0] ?? '');
  const current = groups.get(active) ?? [];
  const totals = totalsFor(active, current);
  const money = (cents: number) => formatMoney(cents, active, language);
  const pending = current.flatMap((l) => l.payments.filter((p) => p.status === 'pending').map((p) => ({ loan: l, payment: p })));

  if (loans === null) {
    return error ? (
      <div className={errorBox}>{error}</div>
    ) : (
      <div className="flex justify-center p-16">
        <Loader2 className="animate-spin text-[var(--accent-500)]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('home.adminTitle')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('home.adminSubtitle')}</p>
        </div>
        <CurrencyTabs currencies={currencies} value={active} onChange={setCurrency} />
      </div>

      {loans.length === 0 ? (
        <div className={`${card} flex flex-col items-center gap-3 p-12 text-center`}>
          <PiggyBank size={40} className="text-[var(--accent-500)]" />
          <p className="font-medium text-slate-900 dark:text-slate-100">{t('home.noLoansTitle')}</p>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{t('home.noLoansHint')}</p>
          <Link to="/users-manager" className={btn.primary}>
            {t('nav.userManager')}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={Banknote}
              label={t('home.lent')}
              value={money(totals.lentCents)}
              hint={t('home.activeLoans', { count: totals.activeLoans })}
            />
            <StatTile
              icon={Wallet}
              label={t('home.collected')}
              value={money(totals.paidCents)}
              hint={t('home.percentOfTotal', { percent: formatPercent(totals.percentPaid, language) })}
            />
            <StatTile
              icon={TrendingUp}
              label={t('home.interestEarned')}
              value={money(totals.interestCollectedCents)}
              hint={t('home.ofExpected', { amount: money(totals.expectedInterestCents) })}
              tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
            />
            <StatTile
              icon={totals.overdueCents > 0 ? AlertTriangle : Hourglass}
              label={t('home.outstanding')}
              value={money(totals.remainingCents)}
              hint={
                totals.overdueCents > 0
                  ? t('home.overdueHint', { amount: money(totals.overdueCents), count: totals.overdueLoans })
                  : t('home.noOverdue')
              }
              tone={
                totals.overdueCents > 0
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
              }
            />
          </div>

          <section className={`${card} p-5`}>
            <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">{t('home.portfolioSettled')}</h3>
            <BalanceMeter
              large
              currency={active}
              principalCollectedCents={totals.principalCollectedCents}
              interestCollectedCents={totals.interestCollectedCents}
              remainingCents={totals.remainingCents}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <CollectionsChart data={monthlyCollections(current)} currency={active} />
            <ProgressChart data={cumulativeProgress(current)} currency={active} />
          </div>

          {pending.length > 0 && (
            <section className={`${card} p-5`}>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Hourglass size={17} className="text-amber-500" /> {t('home.pendingTitle', { count: pending.length })}
              </h3>
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {pending.map(({ loan, payment }) => (
                  <li key={payment.id}>
                    <Link
                      to={`/users-manager/${loan.borrower_id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <Avatar user={loan.borrower} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {loan.borrower.display_name ?? loan.borrower.username} · {loan.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(payment.paid_on, language)}</p>
                      </div>
                      <AiScoreBadge status={payment.ai_status} confidence={payment.ai_confidence} />
                      <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{money(payment.amount_cents)}</span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${card} overflow-hidden`}>
            <h3 className="px-5 pt-5 font-semibold text-slate-900 dark:text-slate-100">{t('home.loansTitle')}</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">{t('loans.borrower')}</th>
                    <th className="px-3 py-2.5 font-medium">{t('loans.title')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('loans.principal')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('loans.rate')}</th>
                    <th className="w-48 px-3 py-2.5 font-medium">{t('loans.progress')}</th>
                    <th className="px-3 py-2.5 font-medium">{t('loans.nextPayment')}</th>
                    <th className="px-5 py-2.5 font-medium">{t('loans.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((loan) => (
                    <tr key={loan.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3">
                        <Link to={`/users-manager/${loan.borrower_id}`} className="flex items-center gap-2.5 hover:underline">
                          <Avatar user={loan.borrower} size={28} />
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {loan.borrower.display_name ?? loan.borrower.username}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">{loan.title}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{money(loan.principal_cents)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {formatPercent(loan.interest_rate, language)} {t(loan.rate_period === 'annual' ? 'loans.perYearShort' : 'loans.perMonthShort')}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--series-track)]">
                            <div
                              className="h-full rounded-full bg-[var(--series-principal)]"
                              style={{ width: `${loan.summary.percentPaid}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                            {formatPercent(loan.summary.percentPaid, language)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {loan.summary.nextInstallment && loan.summary.state !== 'cancelled' && loan.summary.state !== 'paid' ? (
                          <>
                            <span className="tabular-nums">{money(loan.summary.nextInstallment.amountDueCents)}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {formatDate(loan.summary.nextInstallment.dueOn, language)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <LoanStateBadge state={loan.summary.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default AdminHome;
