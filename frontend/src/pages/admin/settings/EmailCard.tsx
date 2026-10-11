import { useEffect, useState } from 'react';
import { BellRing, CircleCheck, CircleSlash, CircleX, Loader2, Mail, Send } from 'lucide-react';
import { ApiError } from '../../../api/client';
import { mailApi, type EmailLogEntry } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import { btn, card, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import Tooltip from '../../../components/ui/Tooltip';
import { useSettingsForm } from './useSettingsForm';

const checkbox = 'h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]';

const STATUS_ICON = {
  sent: <CircleCheck size={14} className="text-emerald-500" />,
  failed: <CircleX size={14} className="text-rose-500" />,
  skipped: <CircleSlash size={14} className="text-slate-400" />,
};

/**
 * SMTP for outgoing email (payment reminders, receipt verdicts, alerts to the
 * lender), the daily reminder schedule, a test button and the recent send log.
 */
const EmailCard = () => {
  const { t, language } = useI18n();
  const { data, form, update, save, saving, error, setError, toast, flash } = useSettingsForm((s) => ({
    smtpEnabled: s.smtp.enabled,
    smtpHost: s.smtp.host,
    smtpPort: s.smtp.port,
    smtpSecure: s.smtp.secure,
    smtpUser: s.smtp.user,
    smtpFrom: s.smtp.from,
    smtpPassword: '',
    remindersEnabled: s.reminders.enabled,
    reminderDaysBefore: s.reminders.daysBefore,
    reminderHour: s.reminders.hour,
  }));
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<EmailLogEntry[]>([]);

  const loadLog = () => mailApi.log().then(setLog).catch(() => undefined);
  useEffect(() => {
    void loadLog();
  }, []);

  if (!form || !data) return null;

  const sendTest = async () => {
    setTesting(true);
    setError('');
    try {
      const { to } = await mailApi.test(testTo || undefined);
      flash(t('adminSettings.testSent', { to }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setTesting(false);
      void loadLog();
    }
  };

  const runReminders = async () => {
    setRunning(true);
    setError('');
    try {
      const { sent } = await mailApi.runReminders();
      flash(t('adminSettings.remindersRan', { count: sent }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setRunning(false);
      void loadLog();
    }
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <Mail size={18} className="text-[var(--accent-500)]" /> {t('adminSettings.emailTitle')}
        </h2>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            data.smtp.configured
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {data.smtp.configured ? <CircleCheck size={12} /> : <CircleSlash size={12} />}
          {t(data.smtp.configured ? 'adminSettings.statusConfigured' : 'adminSettings.statusNotConfigured')}
        </span>
      </div>
      <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">{t('adminSettings.emailHint')}</p>
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}

      <label className="mb-4 flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={form.smtpEnabled} onChange={(e) => update({ smtpEnabled: e.target.checked })} className={checkbox} />
        {t('adminSettings.smtpEnabled')}
      </label>

      <div className={`grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 ${form.smtpEnabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div>
          <label className={label} htmlFor="smtp-host">
            {t('adminSettings.smtpHost')}
          </label>
          <input id="smtp-host" value={form.smtpHost} onChange={(e) => update({ smtpHost: e.target.value })} placeholder="smtp.gmail.com" className={input} />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <label className={label} htmlFor="smtp-port">
              {t('adminSettings.smtpPort')}
            </label>
            <input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              value={form.smtpPort}
              onChange={(e) => update({ smtpPort: Number(e.target.value) })}
              className={input}
            />
          </div>
          <label className="mb-2.5 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={form.smtpSecure} onChange={(e) => update({ smtpSecure: e.target.checked })} className={checkbox} />
            <span className="flex items-center gap-1">
              TLS
              <Tooltip text={t('adminSettings.smtpSecureDescription')} />
            </span>
          </label>
        </div>
        <div>
          <label className={label} htmlFor="smtp-user">
            {t('adminSettings.smtpUser')}
          </label>
          <input id="smtp-user" value={form.smtpUser} onChange={(e) => update({ smtpUser: e.target.value })} autoComplete="off" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="smtp-pass">
            {t('adminSettings.smtpPassword')}
          </label>
          <input
            id="smtp-pass"
            type="password"
            value={form.smtpPassword}
            onChange={(e) => update({ smtpPassword: e.target.value })}
            placeholder={data.smtp.passwordSet ? t('adminSettings.maxmindSetPlaceholder') : ''}
            autoComplete="new-password"
            className={input}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={`${label} flex items-center gap-1.5`} htmlFor="smtp-from">
            {t('adminSettings.smtpFrom')}
            <Tooltip text={t('adminSettings.smtpFromDescription')} />
          </label>
          <input
            id="smtp-from"
            value={form.smtpFrom}
            onChange={(e) => update({ smtpFrom: e.target.value })}
            placeholder='PixlBank <bank@example.com>'
            className={input}
          />
        </div>
      </div>

      <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <BellRing size={16} className="text-[var(--accent-500)]" /> {t('adminSettings.remindersTitle')}
      </h3>
      <label className="mt-3 flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={form.remindersEnabled}
          onChange={(e) => update({ remindersEnabled: e.target.checked })}
          className={checkbox}
        />
        {t('adminSettings.remindersEnabled')}
      </label>
      <div className={`mt-3 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 ${form.remindersEnabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="rem-days">
            {t('adminSettings.reminderDaysBefore')}
            <Tooltip text={t('adminSettings.reminderDaysBeforeDescription')} />
          </label>
          <input
            id="rem-days"
            type="number"
            min={0}
            max={30}
            value={form.reminderDaysBefore}
            onChange={(e) => update({ reminderDaysBefore: Number(e.target.value) })}
            className={input}
          />
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="rem-hour">
            {t('adminSettings.reminderHour')}
            <Tooltip text={t('adminSettings.reminderHourDescription')} />
          </label>
          <input
            id="rem-hour"
            type="number"
            min={0}
            max={23}
            value={form.reminderHour}
            onChange={(e) => update({ reminderHour: Number(e.target.value) })}
            className={input}
          />
        </div>
      </div>
      {data.reminders.lastRun && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('adminSettings.remindersLastRun', { date: data.reminders.lastRun })}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => void save(form)} disabled={saving} className={btn.primary}>
          {saving && <Loader2 className="animate-spin" size={16} />}
          {t('common.save')}
        </button>
        <button type="button" onClick={() => void runReminders()} disabled={running || !data.smtp.configured} className={btn.secondary}>
          {running ? <Loader2 className="animate-spin" size={16} /> : <BellRing size={16} />}
          {t('adminSettings.runReminders')}
        </button>
      </div>

      <div className="mt-6 max-w-2xl border-t border-slate-200 pt-5 dark:border-slate-700">
        <label className={label} htmlFor="smtp-test">
          {t('adminSettings.testEmail')}
        </label>
        <div className="flex gap-2">
          <input
            id="smtp-test"
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={t('adminSettings.testEmailPlaceholder')}
            className={input}
          />
          <button type="button" onClick={() => void sendTest()} disabled={testing || !data.smtp.configured} className={btn.secondary}>
            {testing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            {t('adminSettings.sendTest')}
          </button>
        </div>
        {!data.smtp.configured && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('adminSettings.saveFirst')}</p>}
      </div>

      {log.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t('adminSettings.emailLog')}</h3>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-700">
            {log.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 px-3 py-2">
                <span className="mt-0.5">{STATUS_ICON[entry.status]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">{entry.subject}</p>
                  <p className="truncate text-slate-500 dark:text-slate-400">
                    {entry.to_address} · {new Date(`${entry.created_at.replace(' ', 'T')}Z`).toLocaleString(language)}
                  </p>
                  {entry.error && <p className="truncate text-rose-600 dark:text-rose-400">{entry.error}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </section>
  );
};

export default EmailCard;
