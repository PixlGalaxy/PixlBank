import { Loader2 } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nContext';
import { btn, card, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import Tooltip from '../../../components/ui/Tooltip';
import { useSettingsForm } from './useSettingsForm';

/** App name/title and the public URL used in email links. Live — no restart needed. */
const GeneralCard = () => {
  const { t } = useI18n();
  const { form, update, save, saving, error, toast } = useSettingsForm((s) => ({
    appName: s.appName,
    appTitle: s.appTitle,
    appUrl: s.appUrl,
  }));

  if (!form) return null;

  return (
    <section className={`${card} p-6`}>
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('adminSettings.generalTitle')}</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">{t('adminSettings.generalHint')}</p>
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}

      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="g-name">
            {t('adminSettings.appNameLabel')}
            <Tooltip text={t('adminSettings.appNameDescription')} />
          </label>
          <input id="g-name" value={form.appName} onChange={(e) => update({ appName: e.target.value })} className={input} />
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="g-title">
            {t('adminSettings.appTitleLabel')}
            <Tooltip text={t('adminSettings.appTitleDescription')} />
          </label>
          <input id="g-title" value={form.appTitle} onChange={(e) => update({ appTitle: e.target.value })} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className={`${label} flex items-center gap-1.5`} htmlFor="g-url">
            {t('adminSettings.appUrlLabel')}
            <Tooltip text={t('adminSettings.appUrlDescription')} />
          </label>
          <input
            id="g-url"
            type="url"
            value={form.appUrl}
            onChange={(e) => update({ appUrl: e.target.value })}
            placeholder="https://bank.example.com"
            className={input}
          />
        </div>
      </div>

      <button type="button" onClick={() => void save(form)} disabled={saving} className={`${btn.primary} mt-5`}>
        {saving && <Loader2 className="animate-spin" size={16} />}
        {t('common.save')}
      </button>
      {toast && <Toast message={toast} />}
    </section>
  );
};

export default GeneralCard;
