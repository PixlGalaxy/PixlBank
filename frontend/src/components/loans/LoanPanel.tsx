import { useState } from 'react';
import { BellRing, CalendarClock, HandCoins, Loader2, Pencil, Receipt, Trash2 } from 'lucide-react';
import { loansApi, type LoanDetail } from '../../api/loans';
import type { User } from '../../api/types';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import { formatDate, formatMoney, formatPercent } from '../../lib/money';
import BalanceMeter from '../charts/BalanceMeter';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import Toast from '../ui/Toast';
import { btn, card, errorBox } from '../ui/styles';
import { LoanStateBadge } from './Badges';
import InstallmentsTable from './InstallmentsTable';
import PaymentsList from './PaymentsList';
import LoanFormModal from './LoanFormModal';
import ManualPaymentModal from './ManualPaymentModal';
import ReportPaymentModal from './ReportPaymentModal';

interface Props {
  loan: LoanDetail;
  isAdmin: boolean;
  /** Admin only: the debtor list for the edit form. */
  borrowers?: User[];
  onChanged: () => void;
}

const FREQ_KEY: Record<LoanDetail['frequency'], TranslationKey> = {
  weekly: 'loans.freqWeekly',
  biweekly: 'loans.freqBiweekly',
  monthly: 'loans.freqMonthly',
};

/** One loan: terms, how much is settled, the next due date, the schedule and the payment history. */
const LoanPanel = ({ loan, isAdmin, borrowers = [], onChanged }: Props) => {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<'payments' | 'schedule'>('payments');
  const [modal, setModal] = useState<'edit' | 'pay' | 'report' | 'delete' | null>(null);
  const [reminding, setReminding] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const s = loan.summary;
  const money = (cents: number) => formatMoney(cents, loan.currency, language);
  const open = s.state === 'active' || s.state === 'overdue';

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((c) => (c === message ? null : c)), 2500);
  };

  const remind = async () => {
    setReminding(true);
    setError('');
    try {
      await loansApi.remind(loan.id);
      flash(t('loans.reminderSent'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setReminding(false);
    }
  };

  const remove = async () => {
    setError('');
    try {
      await loansApi.remove(loan.id);
      setModal(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    }
  };

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  const next = s.nextInstallment;
  const dueTone =
    !next || !open
      ? ''
      : next.daysLeft < 0
        ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
        : next.daysLeft <= 3
          ? 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
          : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50';

  return (
    <article className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{loan.title}</h3>
            <LoanStateBadge state={s.state} />
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('loans.termsLine', {
              principal: money(loan.principal_cents),
              rate: formatPercent(loan.interest_rate, language),
              period: t(loan.rate_period === 'annual' ? 'loans.perYear' : 'loans.perMonth'),
              count: loan.installments_count,
              frequency: t(FREQ_KEY[loan.frequency]).toLowerCase(),
              method: t(loan.interest_method === 'french' ? 'loans.methodFrench' : 'loans.methodSimple'),
            })}
          </p>
          {!isAdmin && loan.lender ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              {t('loans.disbursedByLine', { date: formatDate(loan.disbursed_on, language) })}
              <Avatar user={loan.lender} size={20} />
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {loan.lender.display_name ?? loan.lender.username}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {t('loans.disbursedLine', { date: formatDate(loan.disbursed_on, language) })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isAdmin && open && (
            <button type="button" onClick={() => setModal('report')} className={btn.primary}>
              <Receipt size={16} /> {t('payments.reportButton')}
            </button>
          )}
          {isAdmin && (
            <>
              {open && (
                <button type="button" onClick={() => setModal('pay')} className={btn.success}>
                  <HandCoins size={16} /> {t('payments.register')}
                </button>
              )}
              {open && (
                <button type="button" onClick={() => void remind()} disabled={reminding} className={btn.secondary} title={t('loans.sendReminder')}>
                  {reminding ? <Loader2 className="animate-spin" size={16} /> : <BellRing size={16} />}
                  <span className="hidden lg:inline">{t('loans.sendReminder')}</span>
                </button>
              )}
              <button type="button" onClick={() => setModal('edit')} className={btn.iconGhost} title={t('loans.edit')}>
                <Pencil size={16} />
              </button>
              <button type="button" onClick={() => setModal('delete')} className={btn.iconDanger} title={t('common.delete')}>
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className={`${errorBox} mt-4`}>{error}</div>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <BalanceMeter
            large
            currency={loan.currency}
            principalCollectedCents={s.principalCollectedCents}
            interestCollectedCents={s.interestCollectedCents}
            remainingCents={s.remainingCents}
            combined={!isAdmin}
          />
          {/* The interest figures are the lender's earnings: never shown to the debtor. */}
          <dl className={`mt-4 grid grid-cols-2 gap-3 text-sm ${isAdmin ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {[
              [t('loans.totalToPay'), money(s.totalDueCents)],
              [t('charts.paid'), money(s.paidCents)],
              [t('charts.remaining'), money(s.remainingCents)],
              ...(isAdmin ? [[t('loans.interestEarned'), `${money(s.interestCollectedCents)} / ${money(s.totalInterestCents)}`]] : []),
            ].map(([name, value]) => (
              <div key={name}>
                <dt className="text-xs text-slate-500 dark:text-slate-400">{name}</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={`rounded-lg border p-4 ${dueTone || 'border-slate-200 dark:border-slate-700'}`}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <CalendarClock size={14} /> {t('loans.nextPayment')}
          </p>
          {next && open ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(next.amountDueCents)}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{formatDate(next.dueOn, language, { dateStyle: 'full' })}</p>
              <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                {next.daysLeft < 0
                  ? t('loans.daysOverdue', { days: -next.daysLeft })
                  : next.daysLeft === 0
                    ? t('loans.dueToday')
                    : t('loans.daysLeft', { days: next.daysLeft })}
                {' · '}
                {t('loans.installmentOf', { number: next.number, total: loan.installments_count })}
              </p>
              {s.overdueCount > 1 && (
                <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
                  {t('loans.overdueSummary', { count: s.overdueCount, amount: money(s.overdueCents) })}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {s.state === 'paid' ? t('loans.fullyPaid') : t('loans.noNextPayment')}
            </p>
          )}
          {s.pendingReviewCount > 0 && (
            <p className="mt-3 rounded-md bg-amber-100/70 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              {t('loans.pendingReview', { count: s.pendingReviewCount, amount: money(s.pendingReviewCents) })}
            </p>
          )}
        </div>
      </div>

      {loan.notes && <p className="mt-4 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{loan.notes}</p>}

      <div className="mt-5">
        <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button type="button" className={tabClass(tab === 'payments')} onClick={() => setTab('payments')}>
            {t('loans.tabPayments')} ({loan.payments.length})
          </button>
          <button type="button" className={tabClass(tab === 'schedule')} onClick={() => setTab('schedule')}>
            {t('loans.tabSchedule')} ({s.installmentsPaid}/{loan.installments_count})
          </button>
        </div>
        {tab === 'payments' ? (
          <PaymentsList payments={loan.payments} currency={loan.currency} isAdmin={isAdmin} onChanged={onChanged} />
        ) : (
          <InstallmentsTable installments={loan.installments} currency={loan.currency} showSplit={isAdmin} />
        )}
      </div>

      {modal === 'edit' && (
        <LoanFormModal
          loan={loan}
          borrowers={borrowers}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
      {modal === 'pay' && (
        <ManualPaymentModal
          loan={loan}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
      {modal === 'report' && (
        <ReportPaymentModal
          loan={loan}
          onClose={() => setModal(null)}
          onSent={() => {
            setModal(null);
            flash(t('payments.sentToast'));
            onChanged();
          }}
        />
      )}
      {modal === 'delete' && (
        <Modal title={t('loans.deleteTitle')} onClose={() => setModal(null)}>
          <p className="text-slate-600 dark:text-slate-300">{t('loans.confirmDelete', { title: loan.title })}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setModal(null)} className={btn.secondary}>
              {t('common.cancel')}
            </button>
            <button onClick={() => void remove()} className={btn.danger}>
              <Trash2 size={16} /> {t('common.delete')}
            </button>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast} />}
    </article>
  );
};

export default LoanPanel;
