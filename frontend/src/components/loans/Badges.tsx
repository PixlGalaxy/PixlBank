import {
  AlertTriangle,
  Ban,
  Bot,
  CircleDashed,
  Clock,
  CircleCheck,
  CircleX,
  Hourglass,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import type { AiFlag, AiStatus, InstallmentState, LoanState, PaymentStatus } from '../../api/loans';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';

const TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  critical: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
} as const;

type Tone = keyof typeof TONES;

const Badge = ({ tone, icon: Icon, label }: { tone: Tone; icon: LucideIcon; label: string }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
    <Icon size={12} />
    {label}
  </span>
);

const LOAN: Record<LoanState, [Tone, LucideIcon, TranslationKey]> = {
  active: ['info', Clock, 'loanState.active'],
  overdue: ['critical', AlertTriangle, 'loanState.overdue'],
  paid: ['good', CircleCheck, 'loanState.paid'],
  cancelled: ['neutral', Ban, 'loanState.cancelled'],
};

const INSTALLMENT: Record<InstallmentState, [Tone, LucideIcon, TranslationKey]> = {
  paid: ['good', CircleCheck, 'installmentState.paid'],
  partial: ['warning', CircleDashed, 'installmentState.partial'],
  overdue: ['critical', AlertTriangle, 'installmentState.overdue'],
  pending: ['neutral', Clock, 'installmentState.pending'],
};

const PAYMENT: Record<PaymentStatus, [Tone, LucideIcon, TranslationKey]> = {
  approved: ['good', CircleCheck, 'paymentStatus.approved'],
  pending: ['warning', Hourglass, 'paymentStatus.pending'],
  rejected: ['critical', CircleX, 'paymentStatus.rejected'],
};

export const LoanStateBadge = ({ state }: { state: LoanState }) => {
  const { t } = useI18n();
  const [tone, icon, key] = LOAN[state];
  return <Badge tone={tone} icon={icon} label={t(key)} />;
};

export const InstallmentStateBadge = ({ state }: { state: InstallmentState }) => {
  const { t } = useI18n();
  const [tone, icon, key] = INSTALLMENT[state];
  return <Badge tone={tone} icon={icon} label={t(key)} />;
};

export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => {
  const { t } = useI18n();
  const [tone, icon, key] = PAYMENT[status];
  return <Badge tone={tone} icon={icon} label={t(key)} />;
};

/** Score bands shared by both views — the same thresholds the server uses for the debtor's color flag. */
export function scoreTone(confidence: number): 'good' | 'warning' | 'alarm' {
  return confidence >= 75 ? 'good' : confidence >= 40 ? 'warning' : 'alarm';
}

const SCORE_STYLE = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-600/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/30 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  // Deliberately loud: a receipt that doesn't add up should be impossible to miss.
  alarm: 'bg-rose-600 text-white ring-rose-700 dark:bg-rose-600 dark:text-white dark:ring-rose-500',
} as const;

const SCORE_LABEL: Record<keyof typeof SCORE_STYLE, TranslationKey> = {
  good: 'aiScore.good',
  warning: 'aiScore.doubtful',
  alarm: 'aiScore.bad',
};

/**
 * Lender view of the AI check: the 0-100 confidence plus a word for it, or
 * the check's state while there's no score yet (analyzing, off, failed).
 */
export const AiScoreBadge = ({ status, confidence, large }: { status: AiStatus; confidence: number | null; large?: boolean }) => {
  const { t } = useI18n();
  if (status === 'not_required') return null;
  if (confidence === null) {
    const [key, icon]: [TranslationKey, LucideIcon] =
      status === 'pending' ? ['aiScore.analyzing', Loader2] : status === 'disabled' ? ['aiScore.off', Bot] : ['aiScore.failed', Bot];
    const Icon = icon;
    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES.neutral}`}>
        <Icon size={12} className={status === 'pending' ? 'animate-spin' : undefined} />
        {t(key)}
      </span>
    );
  }
  const tone = scoreTone(confidence);
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${SCORE_STYLE[tone]} ${
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <Bot size={large ? 15 : 12} />
      {t('aiScore.label', { score: confidence })}
      <span className="font-normal opacity-90">· {t(SCORE_LABEL[tone])}</span>
    </span>
  );
};

const FLAG_DOT: Record<AiFlag, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-rose-500',
};

/** Debtor view: just a colored dot — no score, the lender decides. */
export const AiFlagBadge = ({ flag, status }: { flag: AiFlag | null; status: AiStatus }) => {
  const { t } = useI18n();
  if (!flag && status !== 'pending') return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES.neutral}`}
      title={t('aiScore.flagHint')}
    >
      {flag ? (
        <span className={`h-2.5 w-2.5 rounded-full ${FLAG_DOT[flag]}`} aria-hidden="true" />
      ) : (
        <Loader2 size={12} className={status === 'pending' ? 'animate-spin' : undefined} />
      )}
      {t('aiScore.flagLabel')}
    </span>
  );
};
