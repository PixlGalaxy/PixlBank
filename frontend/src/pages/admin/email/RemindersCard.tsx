import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { ApiError } from '../../../api/client';
import { mailApi } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import { btn, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import Tooltip from '../../../components/ui/Tooltip';
import { useSettingsForm } from '../settings/useSettingsForm';
import EmailCardShell, { StatusPill } from './EmailCardShell';

const checkbox = 'h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]';

/** The daily payment reminders to debtors: on/off, how early, from what hour, and a manual run. */
const RemindersCard = ({ onSent }: { onSent: () => void }) => {
  const { t } = useI18n();
  const { data, form, update, save, saving, error, setError, toast, flash } = useSettingsForm((s) => ({
    remindersEnabled: s.reminders.enabled,
    reminderDaysBefore: s.reminders.daysBefore,
    reminderHour: s.reminders.hour,
  }));
  const [running, setRunning] = useState(false);

  if (!form || !data) return null;

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
      onSent();
    }
  };

  return (
    <EmailCardShell
      icon={BellRing}
      title={t('adminSettings.remindersTitle')}
      badge={<StatusPill tone={data.reminders.enabled ? 'ok' : 'neutral'}>{t(data.reminders.enabled ? 'adminEmail.on' : 'adminEmail.off')}</StatusPill>}
    >
      {error && <div className={`${errorBox} mb-4 break-words`}>{error}</div>}
      <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={form.remindersEnabled}
          onChange={(e) => update({ remindersEnabled: e.target.checked })}
          className={checkbox}
        />
        {t('adminSettings.remindersEnabled')}
      </label>
      <div className={`mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 ${form.remindersEnabled ? '' : 'pointer-events-none opacity-50'}`}>
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

      {toast && <Toast message={toast} />}
    </EmailCardShell>
  );
};

export default RemindersCard;
