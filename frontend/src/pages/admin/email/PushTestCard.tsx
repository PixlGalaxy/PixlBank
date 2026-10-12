import { useEffect, useState } from 'react';
import { BellRing, Loader2, Send, Smartphone } from 'lucide-react';
import { ApiError } from '../../../api/client';
import type { EmailKind } from '../../../api/admin';
import { pushApi } from '../../../api/push';
import { useI18n } from '../../../i18n/I18nContext';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type Language } from '../../../i18n/translations';
import { btn, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import EmailCardShell, { StatusPill } from './EmailCardShell';
import { EMAIL_KINDS } from './emailKinds';

/** Sends a sample notification of each kind to the admin's own phones — e.g. from the laptop to the iPhone. */
const PushTestCard = () => {
  const { t, language } = useI18n();
  const [devices, setDevices] = useState<number | null>(null);
  const [lang, setLang] = useState<Language>(language);
  const [busy, setBusy] = useState<EmailKind | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    pushApi.devices().then((d) => setDevices(d.length), () => setDevices(0));
  }, []);

  const send = async (kind: EmailKind) => {
    setBusy(kind);
    setError('');
    try {
      const { sent, errors, devices: total } = await pushApi.test(kind, lang);
      setDevices(total);
      // The push service's own reason, so a misconfiguration can be fixed without digging through the logs.
      if (errors.length > 0) setError(`${t('adminEmail.pushFailed')} ${errors.join(' · ')}`);
      const message = t('adminEmail.pushSent', { count: sent });
      setToast(message);
      setTimeout(() => setToast((current) => (current === message ? null : current)), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <EmailCardShell
      icon={BellRing}
      title={t('adminEmail.pushTitle')}
      badge={
        devices !== null && (
          <StatusPill tone={devices > 0 ? 'ok' : 'neutral'}>
            <Smartphone size={12} className="mr-1" /> {devices}
          </StatusPill>
        )
      }
    >
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('adminEmail.pushHint')}</p>
      {devices === 0 && <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">{t('adminEmail.pushNoDevices')}</p>}
      {error && <div className={`${errorBox} mb-4 break-words`}>{error}</div>}

      <div className="mb-4 max-w-[180px]">
        <label className={label} htmlFor="push-lang">
          {t('adminEmail.language')}
        </label>
        <select id="push-lang" value={lang} onChange={(e) => setLang(e.target.value as Language)} className={input}>
          {SUPPORTED_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {EMAIL_KINDS.map((kind) => (
          <div key={kind} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{t(`emailKind.${kind}`)}</span>
            <button
              type="button"
              onClick={() => void send(kind)}
              disabled={busy !== null || devices === 0}
              className={`${btn.secondary} shrink-0 px-3 py-1.5`}
            >
              {busy === kind ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
              {t('adminEmail.test')}
            </button>
          </div>
        ))}
      </div>

      {toast && <Toast message={toast} />}
    </EmailCardShell>
  );
};

export default PushTestCard;
