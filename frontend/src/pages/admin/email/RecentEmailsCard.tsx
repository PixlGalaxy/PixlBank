import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { mailApi, type EmailLogEntry } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import type { TranslationKey } from '../../../i18n/translations';
import EmailCardShell, { StatusPill } from './EmailCardShell';
import { EMAIL_KINDS } from './emailKinds';

const STATUS = {
  sent: { tone: 'ok', key: 'adminEmail.statusSent' },
  failed: { tone: 'bad', key: 'adminEmail.statusFailed' },
  skipped: { tone: 'neutral', key: 'adminEmail.statusSkipped' },
} as const;

/** The last emails sent, with the SMTP server's own message when one failed. */
const RecentEmailsCard = ({ refreshKey }: { refreshKey: number }) => {
  const { t, language } = useI18n();
  const [log, setLog] = useState<EmailLogEntry[]>([]);

  useEffect(() => {
    mailApi.log().then(setLog, () => undefined);
  }, [refreshKey]);

  const kindLabel = (kind: string) =>
    (EMAIL_KINDS as string[]).includes(kind) ? t(`emailKind.${kind}` as TranslationKey) : kind;
  const th = 'px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider';
  const td = 'px-3 py-2.5 align-top';

  return (
    <EmailCardShell
      icon={History}
      title={t('adminEmail.recentTitle')}
      badge={<span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{t('adminEmail.lastCount', { count: 20 })}</span>}
    >
      {log.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('adminEmail.noEmails')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className={th}>{t('adminEmail.colTime')}</th>
                <th className={th}>{t('adminEmail.colUser')}</th>
                <th className={th}>{t('adminEmail.colType')}</th>
                <th className={th}>{t('adminEmail.colTo')}</th>
                <th className={th}>{t('adminEmail.colLang')}</th>
                <th className={th}>{t('adminEmail.colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {log.map((entry) => {
                const status = STATUS[entry.status];
                return (
                  <tr key={entry.id} className="text-slate-700 dark:text-slate-200">
                    <td className={`${td} whitespace-nowrap text-slate-500 tabular-nums dark:text-slate-400`}>
                      {new Date(`${entry.created_at.replace(' ', 'T')}Z`).toLocaleString(language)}
                    </td>
                    <td className={`${td} font-medium text-slate-900 dark:text-slate-100`}>
                      {entry.is_test ? t('adminEmail.adminPanel') : (entry.recipient_name ?? '—')}
                    </td>
                    <td className={td}>{kindLabel(entry.kind)}</td>
                    <td className={`${td} break-all`}>{entry.to_address}</td>
                    <td className={`${td} uppercase`}>{entry.language ?? '—'}</td>
                    <td className={`${td} max-w-[320px]`}>
                      <StatusPill tone={status.tone}>{t(status.key)}</StatusPill>
                      {entry.error && <p className="mt-1 break-words text-xs text-rose-600 dark:text-rose-400">{entry.error}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </EmailCardShell>
  );
};

export default RecentEmailsCard;
