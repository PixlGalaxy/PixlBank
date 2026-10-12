import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Loader2, Mail, Pencil, Phone, Plus, TrendingUp, Wallet, Hourglass } from 'lucide-react';
import { usersApi } from '../../api/users';
import { loansApi, scoreApi, type CreditScore, type LoanDetail } from '../../api/loans';
import CreditScoreCard from '../../components/loans/CreditScore';
import type { User } from '../../api/types';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { byCurrency, formatMoney, formatPercent } from '../../lib/money';
import { cumulativeProgress, monthlyCollections, totalsFor } from '../../lib/loanStats';
import { usePollWhileAnalyzing } from '../../hooks/usePollWhileAnalyzing';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import Avatar from '../../components/ui/Avatar';
import StatTile from '../../components/charts/StatTile';
import CollectionsChart from '../../components/charts/CollectionsChart';
import ProgressChart from '../../components/charts/ProgressChart';
import CurrencyTabs from '../../components/loans/CurrencyTabs';
import LoanPanel from '../../components/loans/LoanPanel';
import LoanFormModal from '../../components/loans/LoanFormModal';
import { btn, card, errorBox } from '../../components/ui/styles';
import UserFormModal from '../admin/UserFormModal';

/** One debtor: their details, every loan made to them, the payments they've reported, and how it's all going. */
const BorrowerPage = () => {
  const { userId = '' } = useParams();
  const { t, language } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loans, setLoans] = useState<LoanDetail[] | null>(null);
  const [error, setError] = useState('');
  const [score, setScore] = useState<CreditScore | null>(null);
  const [currency, setCurrency] = useState('');
  const [modal, setModal] = useState<'loan' | 'user' | null>(null);

  const load = useCallback(async () => {
    try {
      const [users, own, userScore] = await Promise.all([
        usersApi.list(),
        loansApi.listDetailed(userId),
        scoreApi.forUser(userId),
      ]);
      setScore(userScore);
      const found = users.find((u) => u.id === userId && u.role === 'user');
      if (!found) {
        setError(t('manager.notFound'));
        return;
      }
      setUser(found);
      setLoans(own);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.loadFailed'));
    }
  }, [userId, t]);

  useEffect(() => {
    void load();
  }, [load]);
  usePollWhileAnalyzing(loans, load);
  useLiveUpdates(load);

  const groups = useMemo(() => byCurrency(loans ?? []), [loans]);
  const currencies = [...groups.keys()];
  const active = currencies.includes(currency) ? currency : (currencies[0] ?? '');
  const current = groups.get(active) ?? [];
  const totals = totalsFor(active, current);
  const money = (cents: number) => formatMoney(cents, active, language);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/users-manager" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft size={16} /> {t('nav.userManager')}
        </Link>
        <div className={errorBox}>{error}</div>
      </div>
    );
  }
  if (!user || loans === null) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="animate-spin text-[var(--accent-500)]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/users-manager" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        <ArrowLeft size={16} /> {t('nav.userManager')}
      </Link>

      <section className={`${card} flex flex-wrap items-center gap-4 p-5`}>
        <Avatar user={user} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{user.display_name ?? user.username}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Mail size={14} /> {user.email}
            </span>
            {user.phone && (
              <span className="flex items-center gap-1.5">
                <Phone size={14} /> {user.phone}
              </span>
            )}
            <span>@{user.username}</span>
            {user.is_active === 0 && (
              <span className="rounded bg-slate-200 px-1.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {t('users.inactive')}
              </span>
            )}
          </div>
          {user.notes && <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{user.notes}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setModal('user')} className={btn.secondary}>
            <Pencil size={16} /> {t('users.edit')}
          </button>
          <button type="button" onClick={() => setModal('loan')} className={btn.primary}>
            <Plus size={16} /> {t('loans.new')}
          </button>
        </div>
      </section>

      {score && <CreditScoreCard score={score} forLender />}

      {loans.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <p className="font-medium text-slate-900 dark:text-slate-100">{t('manager.noLoans')}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('manager.noLoansHint')}</p>
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <CurrencyTabs currencies={currencies} value={active} onChange={setCurrency} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={Banknote} label={t('home.lent')} value={money(totals.lentCents)} hint={t('home.activeLoans', { count: totals.activeLoans })} />
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
              icon={Hourglass}
              label={t('charts.remaining')}
              value={money(totals.remainingCents)}
              hint={totals.overdueCents > 0 ? t('home.overdueHint', { amount: money(totals.overdueCents), count: totals.overdueLoans }) : t('home.noOverdue')}
              tone={
                totals.overdueCents > 0
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <CollectionsChart data={monthlyCollections(current)} currency={active} />
            <ProgressChart data={cumulativeProgress(current)} currency={active} />
          </div>

          <div className="space-y-6">
            {current.map((loan) => (
              <LoanPanel key={loan.id} loan={loan} isAdmin borrowers={[user]} onChanged={() => void load()} />
            ))}
          </div>
        </>
      )}

      {modal === 'loan' && (
        <LoanFormModal
          loan={null}
          borrowers={[user]}
          onClose={() => setModal(null)}
          onSaved={(loan) => {
            setModal(null);
            setCurrency(loan.currency);
            void load();
          }}
        />
      )}
      {modal === 'user' && (
        <UserFormModal
          user={user}
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setModal(null);
            setUser(saved);
          }}
        />
      )}
    </div>
  );
};

export default BorrowerPage;
