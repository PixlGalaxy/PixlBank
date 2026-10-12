import { useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2, Share, Smartphone } from 'lucide-react';
import { ApiError } from '../../api/client';
import { pushApi } from '../../api/push';
import { useI18n } from '../../i18n/I18nContext';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import { btn, card, errorBox } from '../../components/ui/styles';
import Toast from '../../components/ui/Toast';

/**
 * Phone notifications for this device: the same alerts as the emails, which
 * keep arriving regardless. Only offered inside the installed app (home
 * screen) — that's where iOS allows them and where they make sense.
 */
const NotificationsSection = () => {
  const { t } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const refreshDevices = () => pushApi.devices().then((d) => setDevices(d.length), () => undefined);

  useEffect(() => {
    pushState().then(setState, () => setState('unsupported'));
    refreshDevices();
  }, []);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2500);
  };

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await enablePush();
      setState(next);
      if (next === 'on') flash(t('settings.notificationsEnabledToast'));
    } catch (err) {
      setError(t('settings.notificationsFailed', { error: err instanceof ApiError || err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
      void refreshDevices();
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    try {
      await disablePush();
      setState('off');
      flash(t('settings.notificationsDisabledToast'));
    } finally {
      setBusy(false);
      void refreshDevices();
    }
  };

  const note = 'rounded-lg border px-4 py-3 text-sm';

  return (
    <section className={`${card} p-6`}>
      <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
        <BellRing size={18} className="text-[var(--accent-500)]" /> {t('settings.notificationsTitle')}
      </h2>
      <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">{t('settings.notificationsHint')}</p>
      {error && <div className={`${errorBox} mb-4 break-words`}>{error}</div>}

      {state === null && <Loader2 className="animate-spin text-[var(--accent-500)]" size={20} />}

      {state === 'not-installed' && (
        <div className={`${note} flex items-start gap-3 border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200`}>
          <Share size={18} className="mt-0.5 shrink-0" />
          <p>{t('settings.notificationsInstall')}</p>
        </div>
      )}

      {state === 'unsupported' && (
        <div className={`${note} border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`}>
          {t('settings.notificationsUnsupported')}
        </div>
      )}

      {state === 'denied' && (
        <div className={`${note} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`}>
          {t('settings.notificationsDenied')}
        </div>
      )}

      {state === 'off' && (
        <button type="button" onClick={() => void enable()} disabled={busy} className={btn.primary}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : <BellRing size={16} />}
          {t('settings.notificationsEnable')}
        </button>
      )}

      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <BellRing size={14} /> {t('settings.notificationsOn')}
          </span>
          <button type="button" onClick={() => void disable()} disabled={busy} className={btn.secondary}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <BellOff size={16} />}
            {t('settings.notificationsDisable')}
          </button>
        </div>
      )}

      {devices !== null && devices > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Smartphone size={14} /> {t('settings.notificationsDevices', { count: devices })}
        </p>
      )}

      {toast && <Toast message={toast} />}
    </section>
  );
};

export default NotificationsSection;
