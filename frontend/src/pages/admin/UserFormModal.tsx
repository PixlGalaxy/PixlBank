import { useState, type FormEvent } from 'react';
import { Loader2, Mail, Phone, User as UserIcon } from 'lucide-react';
import { usersApi } from '../../api/users';
import type { User } from '../../api/types';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import Modal from '../../components/ui/Modal';
import { btn, errorBox, input, label } from '../../components/ui/styles';

interface Props {
  user: User | null;
  onClose: () => void;
  onSaved: (user: User) => void;
}

const checkbox = 'h-4 w-4 rounded border-slate-300 text-[var(--accent-600)] focus:ring-[var(--accent-500)]';
const sectionTitle = 'flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100';

/** Debtor accounts only — the lender's own account lives in .env and is never edited here. */
const UserFormModal = ({ user, onClose, onSaved }: Props) => {
  const { t } = useI18n();
  const isNew = user === null;

  const [email, setEmail] = useState(user?.email ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [notes, setNotes] = useState(user?.notes ?? '');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(user ? user.is_active === 1 : true);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const saved = user
        ? await usersApi.update(user.id, {
            email,
            displayName: displayName || null,
            phone: phone || null,
            notes: notes || null,
            isActive,
            ...(password ? { password } : {}),
          })
        : await usersApi.create({
            email,
            username,
            password,
            displayName: displayName || null,
            phone: phone || null,
            notes: notes || null,
          });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? t('users.new') : t('users.edit')} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-6">
        {error && <div className={errorBox}>{error}</div>}

        <section className="space-y-4">
          <h3 className={sectionTitle}>
            <UserIcon size={16} className="text-[var(--accent-500)]" />
            {t('users.accountSection')}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="u-username">
                {t('users.username')}
              </label>
              <input
                id="u-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={input}
                disabled={!isNew}
                required
                autoFocus={isNew}
              />
            </div>

            <div>
              <label className={label} htmlFor="u-email">
                {t('users.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input
                  id="u-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${input} pl-9`}
                  required
                />
              </div>
            </div>

            <div>
              <label className={label} htmlFor="u-display">
                {t('users.displayName')}
              </label>
              <input
                id="u-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={input}
                placeholder={username || undefined}
              />
            </div>

            <div>
              <label className={label} htmlFor="u-phone">
                {t('users.phone')}
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input id="u-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${input} pl-9`} />
              </div>
            </div>

            <div>
              <label className={label} htmlFor="u-password">
                {isNew ? t('users.password') : t('users.newPassword')}
              </label>
              <input
                id="u-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
                placeholder={isNew ? undefined : t('users.passwordUnchanged')}
                required={isNew}
                minLength={8}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={label} htmlFor="u-notes">
                {t('users.notes')}
              </label>
              <textarea
                id="u-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={input}
                rows={2}
                placeholder={t('users.notesPlaceholder')}
              />
            </div>
          </div>

          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className={checkbox} />
              {t('users.active')}
            </label>
          )}
          {isNew && <p className="text-xs text-slate-500 dark:text-slate-400">{t('users.debtorHint')}</p>}
        </section>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5 dark:border-slate-700">
          <button type="button" onClick={onClose} className={btn.secondary}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className={btn.primary}>
            {saving && <Loader2 className="animate-spin" size={16} />}
            {isNew ? t('common.create') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default UserFormModal;
