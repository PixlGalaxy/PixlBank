import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CircleCheck, Loader2, Percent, Wallet } from 'lucide-react';
import { loansApi, scoreApi, type CreditScore, type LoanDetail } from '../../api/loans';
import CreditScoreCard from '../../components/loans/CreditScore';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { useI18n } from '../../i18n/I18nContext';
import { byCurrency, formatDate, formatMoney, formatPercent } from '../../lib/money';
import { totalsFor } from '../../lib/loanStats';
import { usePollWhileAnalyzing } from '../../hooks/usePollWhileAnalyzing';
import StatTile from '../../components/charts/StatTile';
import LoanPanel from '../../components/loans/LoanPanel';
import { card, errorBox } from '../../components/ui/styles';

/** A debtor's view: what they owe the lender, what they've paid, and when the next payment is due. */
const DebtorHome = () => {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { appName } = useAppConfig();
  const [loans, setLoans] = useState<LoanDetail[] | null>(null);
  const [error, setError] = useState('');
  const [score, setScore] = useState<CreditScore | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, myScore] = await Promise.all([loansApi.mine(), scoreApi.mine()]);
      setLoans(mine);
      setScore(myScore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);
  usePollWhileAnalyzing(loans, load);

  const groups = useMemo(() => [...byCurrency(loans ?? []).entries()].map(([c, list]) => totalsFor(c, list)), [loans]);

  // The soonest unpaid installment across every open loan.
  const nextDue = (loans ?? [])
    .filter((l) => (l.summary.state === 'active' || l.summary.state === 'overdue') && l.summary.nextInstallment)
    .map((l) => ({ loan: l, next: l.summary.nextInstallment! }))
    .sort((a, b) => a.next.dueOn.localeCompare(b.next.dueOn))[0];

  if (loans === null) {
    return error ? (
      <div className={errorBox}>{error}</div>
    ) : (
      <div className="flex justify-center p-16">
        <Loader2 className="animate-spin text-[var(--accent-500)]" size={32} />
      </div>
    );
  }

  const open = loans.filter((l) => l.summary.state === 'active' || l.summary.state === 'overdue');
  const closed = loans.filter((l) => !(l.summary.state === 'active' || l.summary.state === 'overdue'));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('home.debtorTitle', { name: user?.display_name ?? user?.username ?? '' })}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('home.debtorSubtitle', { app: appName })}</p>
      </div>

      {loans.length === 0 ? (
        <div className={`${card} flex flex-col items-center gap-3 p-12 text-center`}>
          <CircleCheck size={40} className="text-emerald-500" />
          <p className="font-medium text-slate-900 dark:text-slate-100">{t('home.noDebtsTitle')}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('home.noDebtsHint')}</p>
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.currency} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                icon={Wallet}
                label={t('home.youOwe')}
                value={formatMoney(g.remainingCents, g.currency, language)}
                hint={t('home.ofTotal', { amount: formatMoney(g.totalDueCents, g.currency, language) })}
              />
              <StatTile
                icon={CircleCheck}
                label={t('home.youPaid')}
                value={formatMoney(g.paidCents, g.currency, language)}
                tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
              />
              <StatTile
                icon={Percent}
                label={t('home.percentPaid')}
                value={formatPercent(g.percentPaid, language)}
                tone="bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
              />
              <StatTile
                icon={CalendarClock}
                label={t('loans.nextPayment')}
                value={
                  nextDue && nextDue.loan.currency === g.currency
                    ? formatMoney(nextDue.next.amountDueCents, g.currency, language)
                    : '—'
                }
                hint={nextDue && nextDue.loan.currency === g.currency ? formatDate(nextDue.next.dueOn, language) : undefined}
                tone={
                  nextDue && nextDue.loan.currency === g.currency && nextDue.next.daysLeft < 0
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                    : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
                }
              />
            </div>
          ))}

          {score && <CreditScoreCard score={score} />}

          <div className="space-y-6">
            {open.map((loan) => (
              <LoanPanel key={loan.id} loan={loan} isAdmin={false} onChanged={() => void load()} />
            ))}
          </div>

          {closed.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('home.closedLoans')}</h2>
              {closed.map((loan) => (
                <LoanPanel key={loan.id} loan={loan} isAdmin={false} onChanged={() => void load()} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DebtorHome;
