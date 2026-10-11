import { useState } from 'react';
import { Bot, CircleCheck, CircleSlash, Loader2, PlugZap } from 'lucide-react';
import { ApiError } from '../../../api/client';
import { ollamaApi } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';
import { btn, card, errorBox, input, label } from '../../../components/ui/styles';
import Toast from '../../../components/ui/Toast';
import Tooltip from '../../../components/ui/Tooltip';
import { useSettingsForm } from './useSettingsForm';

const checkbox = 'h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]';

/**
 * Receipt scoring with a multimodal model served by Ollama (e.g. gemma3). The
 * model reads the amount and date off the image and rates it; the rules below
 * (max age, amount tolerance) cap that score. It never approves or rejects —
 * the lender always does.
 */
const OllamaCard = () => {
  const { t } = useI18n();
  const { data, form, update, save, saving, error, setError, toast, flash } = useSettingsForm((s) => ({
    ollamaEnabled: s.ollama.enabled,
    ollamaUrl: s.ollama.url,
    ollamaModel: s.ollama.model,
    ollamaTimeoutSeconds: s.ollama.timeoutSeconds,
    receiptMaxAgeDays: s.ollama.maxAgeDays,
    receiptAmountTolerance: s.ollama.amountTolerance,
  }));
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);

  if (!form || !data) return null;

  const test = async () => {
    setTesting(true);
    setError('');
    try {
      const result = await ollamaApi.test(form.ollamaUrl || undefined);
      setModels(result.models);
      flash(t('adminSettings.ollamaReachable', { count: result.models.length }));
    } catch (err) {
      setModels(null);
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setTesting(false);
    }
  };

  const modelMissing = models !== null && !models.includes(form.ollamaModel) && !models.includes(`${form.ollamaModel}:latest`);

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <Bot size={18} className="text-[var(--accent-500)]" /> {t('adminSettings.ollamaTitle')}
        </h2>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            data.ollama.configured
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {data.ollama.configured ? <CircleCheck size={12} /> : <CircleSlash size={12} />}
          {t(data.ollama.configured ? 'adminSettings.statusConfigured' : 'adminSettings.statusNotConfigured')}
        </span>
      </div>
      <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">{t('adminSettings.ollamaHint')}</p>
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}

      <label className="mb-4 flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={form.ollamaEnabled} onChange={(e) => update({ ollamaEnabled: e.target.checked })} className={checkbox} />
        {t('adminSettings.ollamaEnabled')}
      </label>

      <div className={`grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 ${form.ollamaEnabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="sm:col-span-2">
          <label className={`${label} flex items-center gap-1.5`} htmlFor="ol-url">
            {t('adminSettings.ollamaUrl')}
            <Tooltip text={t('adminSettings.ollamaUrlDescription')} />
          </label>
          <div className="flex gap-2">
            <input
              id="ol-url"
              value={form.ollamaUrl}
              onChange={(e) => update({ ollamaUrl: e.target.value })}
              placeholder="http://192.168.1.10:11434"
              className={`${input} font-mono`}
            />
            <button type="button" onClick={() => void test()} disabled={testing || !form.ollamaUrl} className={btn.secondary}>
              {testing ? <Loader2 className="animate-spin" size={16} /> : <PlugZap size={16} />}
              {t('adminSettings.testConnection')}
            </button>
          </div>
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="ol-model">
            {t('adminSettings.ollamaModel')}
            <Tooltip text={t('adminSettings.ollamaModelDescription')} />
          </label>
          <input
            id="ol-model"
            list="ol-models"
            value={form.ollamaModel}
            onChange={(e) => update({ ollamaModel: e.target.value })}
            placeholder="gemma3:12b"
            className={`${input} font-mono`}
          />
          <datalist id="ol-models">{models?.map((m) => <option key={m} value={m} />)}</datalist>
          {modelMissing && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t('adminSettings.ollamaModelMissing')}</p>}
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="ol-timeout">
            {t('adminSettings.ollamaTimeout')}
            <Tooltip text={t('adminSettings.ollamaTimeoutDescription')} />
          </label>
          <input
            id="ol-timeout"
            type="number"
            min={10}
            max={1800}
            value={form.ollamaTimeoutSeconds}
            onChange={(e) => update({ ollamaTimeoutSeconds: Number(e.target.value) })}
            className={input}
          />
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="ol-age">
            {t('adminSettings.receiptMaxAge')}
            <Tooltip text={t('adminSettings.receiptMaxAgeDescription')} />
          </label>
          <input
            id="ol-age"
            type="number"
            min={0}
            max={365}
            value={form.receiptMaxAgeDays}
            onChange={(e) => update({ receiptMaxAgeDays: Number(e.target.value) })}
            className={input}
          />
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`} htmlFor="ol-tol">
            {t('adminSettings.receiptTolerance')}
            <Tooltip text={t('adminSettings.receiptToleranceDescription')} />
          </label>
          <input
            id="ol-tol"
            type="number"
            min={0}
            max={50}
            step={0.1}
            value={form.receiptAmountTolerance}
            onChange={(e) => update({ receiptAmountTolerance: Number(e.target.value) })}
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

export default OllamaCard;
