import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, RotateCcw, Save } from 'lucide-react';
import { ApiError } from '../../../api/client';
import { mailApi, settingsApi, type EmailKind, type EmailTemplate, type EmailTemplateEntry } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type Language, type TranslationKey } from '../../../i18n/translations';
import { btn, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import EmailCardShell from './EmailCardShell';

type Drafts = Partial<Record<EmailKind, Record<string, EmailTemplate>>>;

const FIELDS: { key: keyof EmailTemplate; labelKey: TranslationKey; rows?: number }[] = [
  { key: 'subject', labelKey: 'adminEmail.subject' },
  { key: 'title', labelKey: 'adminEmail.title' },
  { key: 'message', labelKey: 'adminEmail.message', rows: 7 },
  { key: 'button', labelKey: 'adminEmail.button' },
  { key: 'smallPrint', labelKey: 'adminEmail.smallPrint', rows: 3 },
];

const pick = ({ subject, title, message, button, smallPrint }: EmailTemplate): EmailTemplate => ({
  subject,
  title,
  message,
  button,
  smallPrint,
});

const sameTemplate = (a: EmailTemplate, b: EmailTemplate) => FIELDS.every(({ key }) => a[key] === b[key]);

function draftsFrom(entries: EmailTemplateEntry[]): Drafts {
  return Object.fromEntries(
    entries.map((e) => [e.kind, Object.fromEntries(Object.entries(e.languages).map(([lang, tpl]) => [lang, pick(tpl)]))]),
  );
}

const tabClass = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    active
      ? 'bg-[var(--accent-50)] text-[var(--accent-700)] dark:bg-[var(--accent-500)]/15 dark:text-[var(--accent-300)]'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

/** Every email's subject, title, message, button and small print, per language, with a live preview. */
const EmailTemplatesCard = () => {
  const { t, language } = useI18n();
  const [entries, setEntries] = useState<EmailTemplateEntry[] | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [lang, setLang] = useState<Language>(language);
  const [kind, setKind] = useState<EmailKind>('reminder-upcoming');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [hasAppUrl, setHasAppUrl] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2500);
  };

  const apply = (next: EmailTemplateEntry[]) => {
    setEntries(next);
    setDrafts(draftsFrom(next));
  };

  useEffect(() => {
    mailApi.templates().then(apply, (err) => setError(err instanceof ApiError ? err.message : t('common.loadFailed')));
    settingsApi.get().then((s) => setHasAppUrl(Boolean(s.appUrl)), () => undefined);
  }, [t]);

  const entry = entries?.find((e) => e.kind === kind);
  const saved = entry?.languages[lang];
  const draft = drafts[kind]?.[lang];

  // Rendered by the server, exactly as it will be sent; debounced while typing.
  const draftKey = draft ? JSON.stringify(draft) : '';
  useEffect(() => {
    if (!draftKey) return;
    const timer = setTimeout(() => {
      mailApi.preview(kind, lang, JSON.parse(draftKey) as EmailTemplate).then(setPreview, () => setPreview(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [kind, lang, draftKey]);

  const changed = useMemo(() => {
    const out: Drafts = {};
    for (const e of entries ?? []) {
      for (const [code, tpl] of Object.entries(e.languages)) {
        const d = drafts[e.kind]?.[code];
        if (d && !sameTemplate(d, tpl)) out[e.kind] = { ...out[e.kind], [code]: d };
      }
    }
    return out;
  }, [entries, drafts]);
  const dirty = Object.keys(changed).length > 0;

  if (!entries || !entry || !saved || !draft) {
    return error ? <div className={errorBox}>{error}</div> : null;
  }

  const setField = (key: keyof EmailTemplate, value: string) =>
    setDrafts((d) => ({ ...d, [kind]: { ...d[kind], [lang]: { ...d[kind]![lang]!, [key]: value } } }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      apply(await mailApi.saveTemplates(changed));
      flash(t('adminEmail.templatesSaved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminSettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    setConfirmingReset(false);
    setError('');
    try {
      apply(await mailApi.resetTemplates());
      flash(t('adminEmail.templatesReset'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    }
  };

  const copy = (placeholder: string) => {
    void navigator.clipboard?.writeText(placeholder).then(() => flash(t('adminEmail.copied', { placeholder })));
  };

  const isEdited = (k: EmailKind) =>
    entries.find((e) => e.kind === k)!.languages[lang]!.customized || Boolean(changed[k]?.[lang]);

  return (
    <EmailCardShell icon={Mail} title={t('adminEmail.templatesTitle')}>
      <div className="flex flex-wrap items-center gap-1">
        {SUPPORTED_LANGUAGES.map((code) => (
          <button key={code} type="button" onClick={() => setLang(code)} className={tabClass(lang === code)}>
            {LANGUAGE_NAMES[code]}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        {entries.map((e) => (
          <button key={e.kind} type="button" onClick={() => setKind(e.kind)} className={tabClass(kind === e.kind)}>
            {t(`emailKind.${e.kind}`)}
            {isEdited(e.kind) && <span className="ml-1 text-[var(--accent-500)]">•</span>}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('adminEmail.templatesHint')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500 dark:text-slate-400">{t('adminEmail.placeholders')}:</span>
        {entry.vars.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => copy(`{${v}}`)}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {`{${v}}`}
          </button>
        ))}
      </div>
      {!hasAppUrl && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('adminEmail.noAppUrl')}</p>}
      {error && <div className={`${errorBox} mt-4 break-words`}>{error}</div>}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {FIELDS.map(({ key, labelKey, rows }) => (
            <div key={key}>
              <label className={label} htmlFor={`tpl-${key}`}>
                {t(labelKey)}
              </label>
              {rows ? (
                <textarea
                  id={`tpl-${key}`}
                  rows={rows}
                  value={draft[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  className={`${input} resize-y`}
                />
              ) : (
                <input id={`tpl-${key}`} value={draft[key]} onChange={(e) => setField(key, e.target.value)} className={input} />
              )}
              {key === 'button' && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('adminEmail.buttonHint', { app: '{app}' })}</p>}
            </div>
          ))}
          {!sameTemplate(draft, saved.defaults) && (
            <button type="button" onClick={() => setDrafts((d) => ({ ...d, [kind]: { ...d[kind], [lang]: pick(saved.defaults) } }))} className={btn.secondary}>
              <RotateCcw size={16} /> {t('adminEmail.restoreDefault')}
            </button>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-2 truncate text-sm text-slate-500 dark:text-slate-400">
            {t('adminEmail.previewSubject', { subject: preview?.subject ?? '…' })}
          </p>
          {/* Sandboxed: the preview can't run anything or navigate the admin panel. */}
          <iframe
            title={t('adminEmail.templatesTitle')}
            sandbox=""
            srcDoc={preview?.html ?? ''}
            className="h-[560px] w-full rounded-lg border border-slate-200 bg-[#eef0f4] dark:border-slate-700"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5 dark:border-slate-700">
        <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={btn.primary}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {t('adminEmail.saveTemplates')}
        </button>
        {confirmingReset ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t('adminEmail.resetConfirm')}</span>
            <button type="button" onClick={() => void resetAll()} className={btn.danger}>
              {t('common.confirm')}
            </button>
            <button type="button" onClick={() => setConfirmingReset(false)} className={btn.secondary}>
              {t('common.cancel')}
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmingReset(true)} className={btn.secondary}>
            {t('adminEmail.resetTemplates')}
          </button>
        )}
        {dirty && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('adminEmail.unsaved')}</span>}
      </div>

      {toast && <Toast message={toast} />}
    </EmailCardShell>
  );
};

export default EmailTemplatesCard;
