import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Hourglass, Loader2, Search, UserPlus, Users } from 'lucide-react';
import { usersApi } from '../../api/users';
import { loansApi, scoreApi, type CreditScore, type LoanDetail } from '../../api/loans';
import { GradeChip } from '../../components/loans/CreditScore';
import type { User } from '../../api/types';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { byCurrency, formatMoney, formatPercent } from '../../lib/money';
import { totalsFor } from '../../lib/loanStats';
import Avatar from '../../components/ui/Avatar';
import { btn, card, errorBox, input } from '../../components/ui/styles';
import UserFormModal from '../admin/UserFormModal';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

/**
 * The lender's debtors at a glance — distinct from the Admin Panel's account
 * management: here each person is shown by what they owe, and opening one
 * leads to their loans, payments and charts.
 */
const UserManagerPage = () => {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loans, setLoans] = useState<LoanDetail[]>([]);
  const [scores, setScores] = useState<Record<string, CreditScore>>({});
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [allUsers, allLoans, allScores] = await Promise.all([usersApi.list(), loansApi.listDetailed(), scoreApi.all()]);
      setScores(allScores);
      setUsers(allUsers.filter((u) => u.role === 'user'));
      setLoans(allLoans);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveUpdates(load);

  const byBorrower = useMemo(() => {
    const map = new Map<string, LoanDetail[]>();
    for (const loan of loans) map.set(loan.borrower_id, [...(map.get(loan.borrower_id) ?? []), loan]);
    return map;
  }, [loans]);

  const filtered = (users ?? []).filter((u) => {
    const q = query.trim().toLowerCase();
    return !q || [u.username, u.display_name ?? '', u.email, u.phone ?? ''].some((v) => v.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('nav.userManager')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('manager.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('manager.search')}
              className={`${input} w-56 pl-9`}
            />
          </div>
          <button type="button" onClick={() => setCreating(true)} className={btn.primary}>
            <UserPlus size={16} /> {t('manager.newDebtor')}
          </button>
        </div>
      </div>

      {error && <div className={errorBox}>{error}</div>}

      {users === null ? (
        <div className="flex justify-center p-16">
          <Loader2 className="animate-spin text-[var(--accent-500)]" size={32} />
        </div>
      ) : users.length === 0 ? (
        <div className={`${card} flex flex-col items-center gap-3 p-12 text-center`}>
          <Users size={40} className="text-[var(--accent-500)]" />
          <p className="font-medium text-slate-900 dark:text-slate-100">{t('manager.emptyTitle')}</p>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{t('manager.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((u) => {
            const own = byBorrower.get(u.id) ?? [];
            const groups = [...byCurrency(own).entries()].map(([c, list]) => totalsFor(c, list));
            const overdue = own.filter((l) => l.summary.state === 'overdue').length;
            const pending = own.reduce((s, l) => s + l.summary.pendingReviewCount, 0);
            return (
              <Link
                key={u.id}
                to={`/users-manager/${u.id}`}
                className={`${card} group flex flex-col gap-4 p-5 transition hover:border-[var(--accent-300)] hover:shadow-sm dark:hover:border-[var(--accent-700)]`}
              >
                <div className="flex items-center gap-3">
                  <Avatar user={u} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{u.display_name ?? u.username}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 transition group-hover:translate-x-0.5" />
                </div>

                {groups.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('manager.noLoans')}</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.currency}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{t('manager.owes')}</span>
                        <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatMoney(g.remainingCents, g.currency, language)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--series-track)]">
                          <div className="h-full rounded-full bg-[var(--series-principal)]" style={{ width: `${g.percentPaid}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                          {formatPercent(g.percentPaid, language)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('manager.interestLine', { amount: formatMoney(g.interestCollectedCents, g.currency, language) })}
                      </p>
                    </div>
                  ))
                )}

                <div className="mt-auto flex flex-wrap gap-1.5">
                  {scores[u.id] && <GradeChip score={scores[u.id]!} />}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {t('manager.loanCount', { count: own.length })}
                  </span>
                  {overdue > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                      <AlertTriangle size={12} /> {t('manager.overdueCount', { count: overdue })}
                    </span>
                  )}
                  {pending > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      <Hourglass size={12} /> {t('manager.pendingCount', { count: pending })}
                    </span>
                  )}
                  {u.is_active === 0 && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {t('users.inactive')}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {creating && (
        <UserFormModal
          user={null}
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            navigate(`/users-manager/${created.id}`);
          }}
        />
      )}
    </div>
  );
};

export default UserManagerPage;
