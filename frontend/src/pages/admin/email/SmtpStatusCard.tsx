import { useCallback, useEffect, useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { mailApi, type SmtpStatus } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import { btn } from '../../../components/ui/styles';
import EmailCardShell, { StatusPill } from './EmailCardShell';

/** Connects to the SMTP server and signs in — never sends — so the lender sees at a glance whether email works. */
const SmtpStatusCard = ({ refreshKey }: { refreshKey: number }) => {
  const { t, language } = useI18n();
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const run = useCallback(
    () =>
      mailApi
        .check()
        .then(setStatus, () => setStatus(null))
        .finally(() => setChecking(false)),
    [],
  );

  const check = () => {
    setChecking(true);
    void run();
  };

  // On open, and again whenever the connection settings are saved or removed.
  useEffect(() => {
    void run();
  }, [run, refreshKey]);

  const online = Boolean(status?.configured && status.reachable && (status.auth === 'ok' || status.auth === 'none'));
  const badge = !status || !status.host ? (
    <StatusPill tone="neutral">{t('adminEmail.notConfigured')}</StatusPill>
  ) : online ? (
    <StatusPill tone="ok">{t('adminEmail.online')}</StatusPill>
  ) : (
    <StatusPill tone="bad">{t('adminEmail.offline')}</StatusPill>
  );

  const good = 'text-emerald-600 dark:text-emerald-400';
  const bad = 'text-rose-600 dark:text-rose-400';
  const stat = (name: string, value: string, tone = 'text-slate-900 dark:text-slate-100') => (
    <div>
      <dt className="text-sm text-slate-500 dark:text-slate-400">{name}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );

  return (
    <EmailCardShell icon={Activity} title={t('adminEmail.statusTitle')} badge={badge}>
      {status?.host ? (
        <dl className="grid grid-cols-2 gap-4 px-1 sm:grid-cols-4">
          {stat(t('adminEmail.server'), `${status.host}:${status.port}`)}
          {stat(
            t('adminEmail.connection'),
            t(status.reachable ? 'adminEmail.reachable' : 'adminEmail.unreachable'),
            status.reachable ? good : bad,
          )}
          {stat(t('adminEmail.ping'), status.pingMs === null ? '—' : `${status.pingMs} ms`)}
          {stat(
            t('adminEmail.signIn'),
            status.auth === 'ok'
              ? t('adminEmail.signInOk')
              : status.auth === 'failed'
                ? t('adminEmail.signInFailed')
                : status.auth === 'none'
                  ? t('adminEmail.signInNone')
                  : '—',
            status.auth === 'ok' ? good : status.auth === 'failed' ? bad : undefined,
          )}
        </dl>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('adminEmail.noServer')}</p>
      )}

      {status?.error && <p className="mt-4 break-words text-sm text-rose-600 dark:text-rose-400">{status.error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={check} disabled={checking} className={btn.secondary}>
          {checking ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          {t(checking ? 'adminEmail.checking' : 'adminEmail.checkNow')}
        </button>
        {status && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {t('adminEmail.checkedAt', { time: new Date(status.checkedAt).toLocaleTimeString(language) })}
          </span>
        )}
      </div>
    </EmailCardShell>
  );
};

export default SmtpStatusCard;
