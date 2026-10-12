import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { card } from '../../../components/ui/styles';

const TONES = {
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  bad: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export const StatusPill = ({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) => (
  <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${TONES[tone]}`}>{children}</span>
);

/** One card of the Email section: a small caps heading with an icon, an optional status on the right, a rule, then the content. */
const EmailCardShell = ({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) => (
  <section className={`${card} p-6`}>
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
      <h2 className="flex items-center gap-2.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        <Icon size={16} /> {title}
      </h2>
      {badge}
    </div>
    {children}
  </section>
);

export default EmailCardShell;
