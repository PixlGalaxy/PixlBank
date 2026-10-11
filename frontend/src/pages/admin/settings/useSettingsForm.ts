import { useEffect, useState } from 'react';
import { ApiError } from '../../../api/client';
import { settingsApi, type AdminSettings, type AdminSettingsPatch } from '../../../api/admin';
import { useI18n } from '../../../i18n/I18nContext';

/**
 * Shared load → edit → save loop for the Admin Panel settings cards: `pick`
 * maps the server's settings into the card's form state, and `save` sends a patch.
 */
export function useSettingsForm<T>(pick: (s: AdminSettings) => T) {
  const { t } = useI18n();
  const [data, setData] = useState<AdminSettings | null>(null);
  const [form, setForm] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const load = () =>
    settingsApi.get().then((d) => {
      setData(d);
      setForm(pick(d));
    });

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2500);
  };

  const save = async (patch: AdminSettingsPatch) => {
    setSaving(true);
    setError('');
    try {
      await settingsApi.update(patch);
      await load();
      flash(t('adminSettings.saved'));
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminSettings.saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<T>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return { data, form, update, save, saving, error, setError, toast, flash };
}
