import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { ApiError } from '../../../api/client';
import { mailApi, type EmailKind } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type Language } from '../../../i18n/translations';
import { btn, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import EmailCardShell from './EmailCardShell';
import { EMAIL_KINDS } from './emailKinds';

/** One button per kind of email: sends it with sample details, in the chosen language, to see it as a debtor would. */
const TestEmailsCard = ({ onSent }: { onSent: () => void }) => {
  const { t, language } = useI18n();
  const [to, setTo] = useState('');
  const [lang, setLang] = useState<Language>(language);
  const [busy, setBusy] = useState<EmailKind | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const send = async (kind: EmailKind) => {
    setBusy(kind);
    setError('');
    try {
      const result = await mailApi.test(to.trim() || undefined, kind, lang);
      const message = t('adminEmail.testSent', { kind: t(`emailKind.${kind}`), to: result.to });
      setToast(message);
      setTimeout(() => setToast((current) => (current === message ? null : current)), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setBusy(null);
      onSent();
    }
  };

  return (
    <EmailCardShell icon={Send} title={t('adminEmail.testsTitle')}>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('adminEmail.testsHint')}</p>
      {error && <div className={`${errorBox} mb-4 break-words`}>{error}</div>}

      <div className="mb-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
        <div>
          <label className={label} htmlFor="tests-to">
            {t('adminEmail.sendTo')}
          </label>
          <input
            id="tests-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('adminEmail.sendToPlaceholder')}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="tests-lang">
            {t('adminEmail.language')}
          </label>
          <select id="tests-lang" value={lang} onChange={(e) => setLang(e.target.value as Language)} className={input}>
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {EMAIL_KINDS.map((kind) => (
          <div
            key={kind}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700"
          >
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{t(`emailKind.${kind}`)}</span>
            <button type="button" onClick={() => void send(kind)} disabled={busy !== null} className={`${btn.secondary} shrink-0 px-3 py-1.5`}>
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

export default TestEmailsCard;
