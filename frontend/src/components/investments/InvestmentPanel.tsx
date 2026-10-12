import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarRange, Coins, Loader2, Pencil, Plus, Sparkles, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { investmentsApi, type Investment, type InvestmentMovement } from '../../api/investments';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate, formatMoney, formatPercent, todayIso } from '../../lib/money';
import StatTile from '../charts/StatTile';
import Modal from '../ui/Modal';
import { btn, card, errorBox } from '../ui/styles';
import InvestmentChart from './InvestmentChart';
import HorizonPicker from './HorizonPicker';
import InvestmentFormModal from './InvestmentFormModal';
import MovementFormModal from './MovementFormModal';

interface Props {
  investment: Investment;
  /** The lender: add money, edit, delete. The account itself only reads. */
  canManage: boolean;
  onChanged: () => void;
}

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
  }`;

/**
 * One investment: what was put in, what it's worth today, what it will be worth
 * on any chosen date, the chart of that expectation, its movements and the
 * month-by-month statement that replaces the spreadsheet.
 */
const InvestmentPanel = ({ investment, canManage, onChanged }: Props) => {
  const { t, language } = useI18n();
  const [horizon, setHorizon] = useState('');
  const [ignoreEnd, setIgnoreEnd] = useState(false);
  const [projected, setProjected] = useState<{ key: string; data: Investment } | null>(null);
  const [tab, setTab] = useState<'movements' | 'statement'>('movements');
  const [modal, setModal] = useState<'edit' | 'movement' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<InvestmentMovement | null>(null);
  const [removing, setRemoving] = useState(false);

  // A chosen date re-projects through the server; any change to the investment re-runs it.
  const custom = Boolean(horizon) || ignoreEnd;
  const key = `${investment.updated_at}|${investment.movements.length}|${horizon}|${ignoreEnd}`;
  useEffect(() => {
    if (!custom) return;
    investmentsApi.get(investment.id, horizon || undefined, ignoreEnd).then(
      (data) => setProjected({ key, data }),
      () => undefined,
    );
  }, [investment.id, horizon, ignoreEnd, custom, key]);
  const inv = custom && projected?.key === key ? projected.data : investment;
  const loadingHorizon = custom && projected?.key !== key;

  const s = inv.summary;
  const money = (cents: number) => formatMoney(cents, inv.currency, language);
  const signed = (cents: number) => `${cents > 0 ? '+' : '−'}${money(Math.abs(cents))}`;
  const now = todayIso();

  const removeMovement = async (movementId: string) => {
    setError('');
    setRemoving(true);
    try {
      await investmentsApi.removeMovement(inv.id, movementId);
      setDeleting(null);
      onChanged();
    } catch (err) {
      setDeleting(null);
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setRemoving(false);
    }
  };

  const remove = async () => {
    setError('');
    try {
      await investmentsApi.remove(inv.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    }
  };

  const th = 'px-3 py-2 font-medium';
  const td = 'px-3 py-2 tabular-nums';

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{inv.title}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              <TrendingUp size={12} /> {t('investments.badge')}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('investments.termsLine', {
              principal: money(inv.principal_cents),
              rate: formatPercent(inv.interest_rate, language),
              period: t(inv.rate_period === 'annual' ? 'investments.effectiveAnnual' : 'investments.effectiveMonthly'),
            })}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {inv.end_on
              ? t('investments.datesLine', { start: formatDate(inv.start_on, language), end: formatDate(inv.end_on, language) })
              : t('investments.openEndedLine', { start: formatDate(inv.start_on, language) })}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModal('movement')} className={btn.success}>
              <Plus size={16} /> {t('investments.addMovement')}
            </button>
            <button type="button" onClick={() => setModal('edit')} className={btn.iconGhost} title={t('investments.edit')}>
              <Pencil size={16} />
            </button>
            {confirmingDelete ? (
              <span className="flex items-center gap-2 text-sm">
                <button type="button" onClick={() => void remove()} className={btn.danger}>
                  {t('common.delete')}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className={btn.secondary}>
                  {t('common.cancel')}
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} className={btn.iconDanger} title={t('common.delete')}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className={`${errorBox} mt-4`}>{error}</div>}
      {inv.notes && <p className="mt-3 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{inv.notes}</p>}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Coins}
          label={t('investments.contributed')}
          value={money(s.contributedCents)}
          hint={s.withdrawnCents > 0 ? t('investments.withdrawnHint', { amount: money(s.withdrawnCents) }) : undefined}
        />
        <StatTile icon={Wallet} label={t('investments.valueToday')} value={money(s.valueTodayCents)} hint={formatDate(now, language)} />
        <StatTile
          icon={Sparkles}
          label={t('investments.interestToDate')}
          value={money(s.interestToDateCents)}
          tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
        />
        <StatTile
          icon={CalendarRange}
          label={t('investments.valueOn', { date: formatDate(s.horizonOn, language) })}
          value={money(s.valueAtHorizonCents)}
          hint={t('investments.interestByThen', { amount: money(s.interestAtHorizonCents) })}
          tone="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <HorizonPicker
          id={inv.id}
          startOn={inv.start_on}
          endOn={inv.end_on}
          value={s.horizonOn}
          onChange={setHorizon}
          ignoreEnd={ignoreEnd}
          onIgnoreEndChange={(ignore) => {
            setIgnoreEnd(ignore);
            // Back within the term, a date past the end no longer makes sense.
            if (!ignore && inv.end_on && horizon > inv.end_on) setHorizon('');
          }}
        />
        {custom && !inv.end_on && (
          <button type="button" onClick={() => setHorizon('')} className={`${btn.secondary} mb-px`}>
            {t('investments.resetHorizon')}
          </button>
        )}
        {loadingHorizon && <Loader2 className="mb-2.5 animate-spin text-[var(--accent-500)]" size={18} />}
      </div>

      <div className="mt-5">
        <InvestmentChart investment={inv} />
      </div>

      <div className="mt-5">
        <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button type="button" className={tabClass(tab === 'movements')} onClick={() => setTab('movements')}>
            {t('investments.tabMovements')} ({inv.movements.length})
          </button>
          <button type="button" className={tabClass(tab === 'statement')} onClick={() => setTab('statement')}>
            {t('investments.tabStatement')}
          </button>
        </div>

        {tab === 'movements' ? (
          inv.movements.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t('investments.noMovements')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {inv.movements.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      m.amountCents > 0
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                    }`}
                  >
                    {m.amountCents > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{signed(m.amountCents)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(m.movedOn, language)} ·{' '}
                      {t(m.accrual === 'same_day' ? 'investments.accrualSameDayShort' : 'investments.accrualMonthEndShort')}
                      {m.movedOn > now && <> · {t('investments.planned')}</>}
                      {m.note && <> · {m.note}</>}
                    </p>
                  </div>
                  {canManage && (
                    <button type="button" onClick={() => setDeleting(m)} className={btn.iconDanger} title={t('common.delete')}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>{t('investments.colPeriod')}</th>
                  <th className={`${th} text-right`}>{t('investments.colDays')}</th>
                  <th className={`${th} text-right`}>{t('investments.colOpening')}</th>
                  <th className={`${th} text-right`}>{t('investments.colInterest')}</th>
                  <th className={`${th} text-right`}>{t('investments.colMovement')}</th>
                  <th className={`${th} text-right`}>{t('investments.colClosing')}</th>
                </tr>
              </thead>
              <tbody>
                {inv.statement.map((p, i) => (
                  <tr
                    key={p.to}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      p.projected ? 'text-slate-400 italic dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <td className={`${td} text-slate-500`}>{i + 1}</td>
                    <td className="px-3 py-2">
                      {formatDate(p.to, language, { month: 'long', year: 'numeric' })}
                      <span className="block text-xs text-slate-400">
                        {formatDate(p.from, language)} → {formatDate(p.to, language)}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>{p.days}</td>
                    <td className={`${td} text-right`}>{money(p.openingCents)}</td>
                    <td className={`${td} text-right text-emerald-700 dark:text-emerald-400`}>{money(p.interestCents)}</td>
                    <td className={`${td} text-right`}>{p.movementCents ? signed(p.movementCents) : ''}</td>
                    <td className={`${td} text-right font-medium`}>{money(p.closingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'statement' && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('investments.statementHint')}</p>}
      </div>

      {modal === 'edit' && (
        <InvestmentFormModal
          investment={inv}
          ownerId={inv.owner_id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
      {deleting && (
        <Modal title={t(deleting.amountCents > 0 ? 'investments.deleteContributionTitle' : 'investments.deleteWithdrawalTitle')} onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('investments.deleteMovementConfirm', {
              amount: money(Math.abs(deleting.amountCents)),
              date: formatDate(deleting.movedOn, language),
            })}
          </p>
          {deleting.note && <p className="mt-2 text-sm italic text-slate-500 dark:text-slate-400">“{deleting.note}”</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleting(null)} className={btn.secondary}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void removeMovement(deleting.id)} disabled={removing} className={btn.danger}>
              {removing ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
              {t('common.delete')}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'movement' && (
        <MovementFormModal
          investment={inv}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
};

export default InvestmentPanel;
