import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, ChevronRight, Hourglass, Loader2, PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import { loansApi, type LoanDetail } from '../../api/loans';
import { investmentsApi, type Investment } from '../../api/investments';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { byCurrency, formatDate, formatMoney, formatPercent } from '../../lib/money';
import { cumulativeProgress, monthlyCollections, totalsFor } from '../../lib/loanStats';
import StatTile from '../../components/charts/StatTile';
import CollectionsChart from '../../components/charts/CollectionsChart';
import ProgressChart from '../../components/charts/ProgressChart';
import InvestmentValueChart from '../../components/charts/InvestmentValueChart';
import { investmentValueSeries } from '../../lib/investmentStats';
import BalanceMeter from '../../components/charts/BalanceMeter';
import CurrencyTabs from '../../components/loans/CurrencyTabs';
import { AiScoreBadge, LoanStateBadge } from '../../components/loans/Badges';
import { usePollWhileAnalyzing } from '../../hooks/usePollWhileAnalyzing';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import Avatar from '../../components/ui/Avatar';
import { btn, card, errorBox } from '../../components/ui/styles';

/** The lender's dashboard: every loan they've made, what it has returned and what's still out. */
const AdminHome = () => {
  const { t, language } = useI18n();
  const [loans, setLoans] = useState<LoanDetail[] | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState('');

  const load = useCallback(async () => {
    try {
      const [allLoans, allInvestments] = await Promise.all([loansApi.listDetailed(), investmentsApi.list()]);
      setInvestments(allInvestments);
      setLoans(allLoans);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);
  usePollWhileAnalyzing(loans, load);
  useLiveUpdates(load);

  const groups = useMemo(() => byCurrency(loans ?? []), [loans]);
  const investmentGroups = useMemo(() => byCurrency(investments), [investments]);
  // A currency with only investments still gets its tab.
  const currencies = [...new Set([...groups.keys(), ...investmentGroups.keys()])];
  const active = currencies.includes(currency) ? currency : (currencies[0] ?? '');
  const current = groups.get(active) ?? [];
  const currentInvestments = investmentGroups.get(active) ?? [];
  const totals = totalsFor(active, current);
  const invested = currentInvestments.reduce((s, i) => s + i.summary.contributedCents - i.summary.withdrawnCents, 0);
  const investmentsWorth = currentInvestments.reduce((s, i) => s + i.summary.valueTodayCents, 0);
  const investmentInterest = currentInvestments.reduce((s, i) => s + i.summary.interestToDateCents, 0);
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

      {loans.length === 0 && investments.length === 0 ? (
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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
              icon={PiggyBank}
              label={t('home.invested')}
              value={money(invested)}
              hint={t('home.investedHint', { amount: money(investmentsWorth) })}
              tone="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
            />
            {/* All interest income, whether it came from loans or grew inside investments. */}
            <StatTile
              icon={TrendingUp}
              label={t('home.interestEarned')}
              value={money(totals.interestCollectedCents + investmentInterest)}
              hint={
                currentInvestments.length > 0
                  ? t('home.interestSplit', { loans: money(totals.interestCollectedCents), investments: money(investmentInterest) })
                  : t('home.ofExpected', { amount: money(totals.expectedInterestCents) })
              }
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

          {/* Loans on top, investments below. Always shown, even empty, so switching currency never reflows the page. */}
          <div className="grid gap-6 xl:grid-cols-2">
            <CollectionsChart data={monthlyCollections(current)} currency={active} />
            <ProgressChart data={cumulativeProgress(current)} currency={active} />
          </div>
          <InvestmentValueChart data={investmentValueSeries(currentInvestments)} currency={active} />

          {current.length > 0 && (
            <section className={`${card} p-5`}>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Banknote size={17} className="text-[var(--series-principal)]" /> {t('home.loansTitle')}
              </h3>
              {/* Same card as the investments below: reads well on a phone and on a wide screen alike. */}
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {current.map((loan) => {
                  const next =
                    loan.summary.nextInstallment && loan.summary.state !== 'cancelled' && loan.summary.state !== 'paid'
                      ? loan.summary.nextInstallment
                      : null;
                  return (
                    <li key={loan.id}>
                      <Link
                        to={`/users-manager/${loan.borrower_id}`}
                        className="block rounded-lg border border-slate-200 p-4 transition hover:border-[var(--accent-300)] hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar user={loan.borrower} size={32} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                              {loan.borrower.display_name ?? loan.borrower.username}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {loan.title} · {formatPercent(loan.interest_rate, language)}{' '}
                              {t(loan.rate_period === 'annual' ? 'loans.perYearShort' : 'loans.perMonthShort')}
                            </p>
                          </div>
                          <LoanStateBadge state={loan.summary.state} />
                          <ChevronRight size={16} className="shrink-0 text-slate-400" />
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">{t('loans.principal')}</dt>
                            <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(loan.principal_cents)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">{t('loans.nextPayment')}</dt>
                            <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                              {next ? money(next.amountDueCents) : '—'}
                              {next && (
                                <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                                  {formatDate(next.dueOn, language)}
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--series-track)]">
                            <div className="h-full rounded-full bg-[var(--series-principal)]" style={{ width: `${loan.summary.percentPaid}%` }} />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {formatPercent(loan.summary.percentPaid, language)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}


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

          {currentInvestments.length > 0 && (
            <section className={`${card} p-5`}>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <TrendingUp size={17} className="text-violet-500" /> {t('home.investmentsTitle')}
              </h3>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {currentInvestments.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      to={`/users-manager/${inv.owner_id}`}
                      className="block rounded-lg border border-slate-200 p-4 transition hover:border-[var(--accent-300)] hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar user={inv.owner} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900 dark:text-slate-100">{inv.owner.display_name ?? inv.owner.username}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {inv.title} · {formatPercent(inv.interest_rate, language)}{' '}
                            {t(inv.rate_period === 'annual' ? 'loans.perYearShort' : 'loans.perMonthShort')}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500 dark:text-slate-400">{t('investments.valueToday')}</dt>
                          <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(inv.summary.valueTodayCents)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500 dark:text-slate-400">{t('investments.interestToDate')}</dt>
                          <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{money(inv.summary.interestToDateCents)}</dd>
                        </div>
                      </dl>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default AdminHome;
