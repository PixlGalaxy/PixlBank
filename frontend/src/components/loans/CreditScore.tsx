import { useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Gauge, Sparkles } from 'lucide-react';
import type { CreditScore, Grade } from '../../api/loans';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import { card } from '../ui/styles';

/** Best first, with each grade's point range — mirrors GRADE_FLOORS in the backend's score.service.ts. */
const GRADES: { grade: Grade; from: number; to: number; solid: string; tint: string; name: TranslationKey; hint: TranslationKey }[] = [
  { grade: 'A', from: 85, to: 100, solid: 'bg-emerald-600', tint: 'bg-emerald-500/25', name: 'score.nameA', hint: 'score.hintA' },
  { grade: 'B', from: 70, to: 85, solid: 'bg-lime-600', tint: 'bg-lime-500/25', name: 'score.nameB', hint: 'score.hintB' },
  { grade: 'C', from: 55, to: 70, solid: 'bg-amber-500', tint: 'bg-amber-400/25', name: 'score.nameC', hint: 'score.hintC' },
  { grade: 'D', from: 40, to: 55, solid: 'bg-orange-600', tint: 'bg-orange-500/25', name: 'score.nameD', hint: 'score.hintD' },
  { grade: 'E', from: 0, to: 40, solid: 'bg-rose-600', tint: 'bg-rose-500/25', name: 'score.nameE', hint: 'score.hintE' },
];

const info = (grade: Grade) => GRADES.find((g) => g.grade === grade)!;

/** Small letter chip for lists (User Manager cards). */
export const GradeChip = ({ score }: { score: CreditScore }) => {
  const { t } = useI18n();
  const g = info(score.grade);
  const Arrow = score.trend === 'up' ? ArrowUpRight : score.trend === 'down' ? ArrowDownRight : null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      title={t(g.hint)}
    >
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${g.solid}`}>{g.grade}</span>
      {t(g.name)}
      {Arrow && <Arrow size={13} className={score.trend === 'up' ? 'text-emerald-600' : 'text-rose-600'} />}
    </span>
  );
};

/**
 * The full score card: the letter, which way it's heading, where it sits on
 * the E→A scale (with last month's position), what each grade means, and the
 * factors behind it. Used on the debtor's Home and My Account, and on the
 * lender's view of each debtor.
 */
const CreditScoreCard = ({ score, forLender = false }: { score: CreditScore; forLender?: boolean }) => {
  const { t } = useI18n();
  const [showHow, setShowHow] = useState(false);
  const g = info(score.grade);
  const delta = score.points - score.previousPoints;
  const ascending = [...GRADES].reverse(); // E on the left, A on the right.
  const TrendIcon = score.trend === 'up' ? ArrowUpRight : score.trend === 'down' ? ArrowDownRight : ArrowRight;
  const trendTone =
    score.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : score.trend === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400';
  const f = score.factors;

  return (
    <section className={`${card} p-5`}>
      <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
        <Gauge size={18} className="text-[var(--accent-500)]" />
        {forLender ? t('score.titleLender') : t('score.title')}
      </h3>

      <div className="mt-4 grid gap-6 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-5xl font-bold text-white shadow-sm ${g.solid}`}>
            {g.grade}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t(g.name)}</p>
            <p className="max-w-56 text-sm text-slate-500 dark:text-slate-400">{t(g.hint)}</p>
            <p className={`mt-1 flex items-center gap-1 text-sm font-medium ${trendTone}`}>
              <TrendIcon size={16} />
              {score.trend === 'flat'
                ? t('score.trendFlat')
                : t(score.trend === 'up' ? 'score.trendUp' : 'score.trendDown', { points: Math.abs(delta) })}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          {/* The scale: one band per grade, a ghost dot for 30 days ago and a marker for today. */}
          <div className="relative pt-6">
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {ascending.map((band) => (
                <div
                  key={band.grade}
                  className={`h-full ${band.grade === score.grade ? band.solid : band.tint}`}
                  style={{ width: `${band.to - band.from}%`, borderRight: band.grade !== 'A' ? '2px solid var(--chart-surface)' : undefined }}
                />
              ))}
            </div>
            {score.previousPoints !== score.points && (
              <span
                className="absolute top-[22px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-dashed border-slate-400 bg-white/70 dark:bg-slate-900/70"
                style={{ left: `${score.previousPoints}%` }}
                title={t('score.thirtyDaysAgo')}
              />
            )}
            <span
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${Math.min(98, Math.max(2, score.points))}%` }}
            >
              <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">
                {t('score.you')}
              </span>
              <span className="mt-0.5 h-4 w-1 rounded-full bg-slate-900 dark:bg-white" />
            </span>
            <div className="mt-1.5 flex text-xs font-semibold text-slate-500 dark:text-slate-400">
              {ascending.map((band) => (
                <span key={band.grade} className="text-center" style={{ width: `${band.to - band.from}%` }}>
                  {band.grade}
                </span>
              ))}
            </div>
          </div>

          {score.willDrop ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {forLender ? t('score.willDropLender', { count: f.overdueUnpaid }) : t('score.willDrop', { count: f.overdueUnpaid })}
            </p>
          ) : score.noHistory ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('score.noHistory')}</p>
          ) : score.toNextGrade !== null ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-[var(--accent-500)]" />
              {t('score.toNext', { points: score.toNextGrade, grade: GRADES[GRADES.findIndex((x) => x.grade === score.grade) - 1]!.grade })}
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <Sparkles size={16} className="mt-0.5 shrink-0" />
              {t('score.top')}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-1.5 sm:grid-cols-5">
        {GRADES.map((band) => (
          <div
            key={band.grade}
            className={`flex items-start gap-2 rounded-lg p-2 text-xs ${
              band.grade === score.grade ? 'bg-slate-100 ring-1 ring-slate-300 dark:bg-slate-800 dark:ring-slate-600' : ''
            }`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white ${band.solid}`}>
              {band.grade}
            </span>
            <span>
              <span className="block font-semibold text-slate-800 dark:text-slate-100">{t(band.name)}</span>
              <span className="text-slate-500 dark:text-slate-400">{t(band.hint)}</span>
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowHow((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-600)] hover:underline dark:text-[var(--accent-400)]"
      >
        <ChevronDown size={14} className={`transition ${showHow ? 'rotate-180' : ''}`} />
        {t('score.howTitle')}
      </button>
      {showHow && (
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {[
            [t('score.fOnTime'), f.onTime, '+4'],
            [t('score.fSlightlyLate'), f.slightlyLate, '0'],
            [t('score.fLate'), f.late, '−4'],
            [t('score.fVeryLate'), f.veryLate, '−8'],
            [t('score.fOverdue'), f.overdueUnpaid, '−3…−15'],
            [t('score.fRejected'), f.rejectedReceipts, '−5'],
            [t('score.fCompleted'), f.completedLoans, '+8'],
          ].map(([name, count, effect]) => (
            <li key={String(name)} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">{name}</span>
              <span className="tabular-nums text-slate-900 dark:text-slate-100">
                <span className="font-semibold">{count}</span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">({effect} {t('score.each')})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CreditScoreCard;
