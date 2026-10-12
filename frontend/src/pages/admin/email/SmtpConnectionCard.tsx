import { useState } from 'react';
import { KeyRound, Loader2, Mail, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { ApiError } from '../../../api/client';
import { mailApi } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import { btn, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import { useSettingsForm } from '../settings/useSettingsForm';
import EmailCardShell, { StatusPill } from './EmailCardShell';

const checkbox = 'h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]';
const hint = 'mt-1 text-xs text-slate-500 dark:text-slate-400';

/** Host, port, credentials and sender for outgoing email, plus a one-off test send. */
const SmtpConnectionCard = ({ onChanged }: { onChanged: () => void }) => {
  const { t } = useI18n();
  const { data, form, update, save, saving, error, setError, toast, flash, reload } = useSettingsForm((s) => ({
    smtpEnabled: s.smtp.enabled,
    smtpHost: s.smtp.host,
    smtpPort: s.smtp.port,
    smtpSecure: s.smtp.secure,
    smtpUser: s.smtp.user,
    smtpFrom: s.smtp.from,
    smtpAllowSelfSigned: s.smtp.allowSelfSigned,
    smtpPassword: '',
  }));
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  if (!form || !data) return null;

  const submit = async () => {
    if (await save(form)) onChanged();
  };

  const remove = async () => {
    setConfirmingRemove(false);
    setError('');
    try {
      await mailApi.clearSettings();
      await reload();
      flash(t('adminEmail.removed'));
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setError('');
    try {
      const { to } = await mailApi.test(testTo.trim() || undefined);
      flash(t('adminSettings.testSent', { to }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setTesting(false);
      onChanged();
    }
  };

  const source = data.smtp.source;
  const badge = (
    <StatusPill tone={source === 'saved' ? 'ok' : source === 'env' ? 'warn' : 'neutral'}>
      {t(source === 'saved' ? 'adminEmail.sourceSaved' : source === 'env' ? 'adminEmail.sourceEnv' : 'adminEmail.sourceNone')}
    </StatusPill>
  );
  const isGmail = /gmail|googlemail/i.test(form.smtpHost);

  return (
    <EmailCardShell icon={Mail} title={t('adminEmail.connectionTitle')} badge={badge}>
      {error && <div className={`${errorBox} mb-4 break-words`}>{error}</div>}

      <label className="mb-5 flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={form.smtpEnabled} onChange={(e) => update({ smtpEnabled: e.target.checked })} className={checkbox} />
        {t('adminEmail.sendEmails')}
      </label>

      <div className={`space-y-4 ${form.smtpEnabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px]">
          <div>
            <label className={label} htmlFor="smtp-host">
              {t('adminEmail.host')}
            </label>
            <input id="smtp-host" value={form.smtpHost} onChange={(e) => update({ smtpHost: e.target.value })} placeholder="smtp.gmail.com" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="smtp-port">
              {t('adminEmail.port')}
            </label>
            <input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              value={form.smtpPort}
              onChange={(e) => {
                const port = Number(e.target.value);
                // 465 is SSL from the first byte, 587 upgrades with STARTTLS — pick the matching mode.
                update({ smtpPort: port, ...(port === 465 ? { smtpSecure: true } : port === 587 ? { smtpSecure: false } : {}) });
              }}
              className={input}
            />
            <p className={hint}>{t('adminEmail.portHint')}</p>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={form.smtpSecure} onChange={(e) => update({ smtpSecure: e.target.checked })} className={`${checkbox} mt-0.5`} />
          <span>
            {t('adminEmail.ssl')}
            <span className="block text-xs text-slate-500 dark:text-slate-400">{t('adminEmail.sslHint')}</span>
          </span>
        </label>

        <div>
          <label className={label} htmlFor="smtp-user">
            {t('adminEmail.user')}
          </label>
          <input id="smtp-user" value={form.smtpUser} onChange={(e) => update({ smtpUser: e.target.value })} autoComplete="off" className={input} />
          <p className={hint}>{t('adminEmail.userHint')}</p>
        </div>

        <div>
          <label className={label} htmlFor="smtp-pass">
            {t('adminEmail.password')}
          </label>
          <div className="relative">
            <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="smtp-pass"
              type="password"
              value={form.smtpPassword}
              onChange={(e) => update({ smtpPassword: e.target.value })}
              placeholder={data.smtp.passwordSet ? t('adminEmail.passwordSavedPlaceholder') : ''}
              autoComplete="new-password"
              className={`${input} pl-9`}
            />
          </div>
          {data.smtp.passwordSet && <p className={hint}>{t('adminEmail.passwordSaved')}</p>}
          {isGmail && <p className={hint}>{t('adminEmail.passwordGmail')}</p>}
        </div>

        <div>
          <label className={label} htmlFor="smtp-from">
            {t('adminEmail.sender')}
          </label>
          <input
            id="smtp-from"
            value={form.smtpFrom}
            onChange={(e) => update({ smtpFrom: e.target.value })}
            placeholder={`PixlBank <${form.smtpUser || 'bank@example.com'}>`}
            className={input}
          />
          <p className={hint}>{t('adminEmail.senderHint')}</p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <input
            type="checkbox"
            checked={form.smtpAllowSelfSigned}
            onChange={(e) => update({ smtpAllowSelfSigned: e.target.checked })}
            className={`${checkbox} mt-0.5`}
          />
          <span>
            <span className="font-medium text-slate-800 dark:text-slate-100">{t('adminEmail.allowSelfSigned')}</span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{t('adminEmail.allowSelfSignedHint')}</span>
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void submit()} disabled={saving} className={btn.primary}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
          {t('common.save')}
        </button>
        {source === 'saved' &&
          (confirmingRemove ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">{t('adminEmail.removeSavedConfirm')}</span>
              <button type="button" onClick={() => void remove()} className={btn.danger}>
                {t('common.confirm')}
              </button>
              <button type="button" onClick={() => setConfirmingRemove(false)} className={btn.secondary}>
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmingRemove(true)} className={btn.secondary}>
              <Trash2 size={16} /> {t('adminEmail.removeSaved')}
            </button>
          ))}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
        <label className={label} htmlFor="smtp-test">
          {t('adminEmail.sendTestTo')}
        </label>
        <div className="flex max-w-xl gap-2">
          <input
            id="smtp-test"
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={t('adminEmail.sendToPlaceholder')}
            className={input}
          />
          <button type="button" onClick={() => void sendTest()} disabled={testing || !data.smtp.configured} className={`${btn.secondary} shrink-0`}>
            {testing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            {t('adminEmail.sendTest')}
          </button>
        </div>
        {!data.smtp.configured && <p className={hint}>{t('adminSettings.saveFirst')}</p>}
      </div>

      {toast && <Toast message={toast} />}
    </EmailCardShell>
  );
};

export default SmtpConnectionCard;
