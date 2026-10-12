import { useEffect, useRef, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Eye, EyeOff, Home, Landmark, LayoutDashboard, LogOut, UserRound, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import Avatar from './ui/Avatar';
import { usePrivacy } from '../lib/privacy';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-2.5 sm:px-4 py-2.5 rounded-lg text-base font-medium transition ${
    isActive
      ? 'bg-[var(--accent-50)] text-[var(--accent-700)] dark:bg-[var(--accent-500)]/15 dark:text-[var(--accent-300)]'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  /** Only the lender sees these. */
  adminOnly?: boolean;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: Home, end: true },
  { to: '/users-manager', labelKey: 'nav.userManager', icon: Users, adminOnly: true },
  { to: '/admin', labelKey: 'nav.adminPanel', icon: LayoutDashboard, adminOnly: true },
];

interface AccountMenuItem extends NavItem {
  /** Each entry gets its own accent so the dropdown reads at a glance. */
  color: string;
}

const ACCOUNT_MENU: AccountMenuItem[] = [
  { to: '/settings?section=account', labelKey: 'nav.account', icon: UserRound, color: 'text-sky-500' },
  { to: '/settings?section=preferences', labelKey: 'nav.settings', icon: SlidersHorizontal, color: 'text-amber-500' },
];

const Navbar = () => {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { appName } = useAppConfig();
  const privacy = usePrivacy();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const logo = (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-600)] text-white sm:h-11 sm:w-11">
        <Landmark size={22} />
      </span>
      <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{appName}</span>
    </span>
  );

  return (
    <nav className="bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      <div className="w-full px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
        {user ? (
          <Link
            to="/"
            className="shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)] focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            {logo}
          </Link>
        ) : (
          <div className="shrink-0">{logo}</div>
        )}

        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          {user && (
            <>
              {NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin').map(({ to, labelKey, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={navLinkClass}>
                  <Icon size={21} />
                  <span className="hidden md:inline">{t(labelKey)}</span>
                </NavLink>
              ))}

              <span className="mx-1 h-7 w-px shrink-0 bg-slate-200 sm:mx-2 dark:bg-slate-700" aria-hidden="true" />
              <button
                type="button"
                onClick={privacy.toggle}
                aria-pressed={privacy.hidden}
                title={t(privacy.hidden ? 'nav.showAmounts' : 'nav.hideAmounts')}
                aria-label={t(privacy.hidden ? 'nav.showAmounts' : 'nav.hideAmounts')}
                className={`shrink-0 rounded-lg p-2.5 transition ${
                  privacy.hidden
                    ? 'bg-[var(--accent-50)] text-[var(--accent-700)] dark:bg-[var(--accent-500)]/15 dark:text-[var(--accent-300)]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                {privacy.hidden ? <EyeOff size={21} /> : <Eye size={21} />}
              </button>

              <div className="relative ml-1" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)] focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                >
                  <Avatar user={user} size={36} />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-2 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="px-4 pb-2 pt-1.5">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {user.display_name ?? user.username}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {t(user.role === 'admin' ? 'users.roleAdmin' : 'users.roleUser')}
                      </p>
                    </div>
                    <span className="mb-1.5 block h-px bg-slate-200 dark:bg-slate-700" />

                    {ACCOUNT_MENU.map(({ to, labelKey, icon: Icon, color }) => (
                      <Link
                        key={to}
                        to={to}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Icon size={18} className={color} />
                        {t(labelKey)}
                      </Link>
                    ))}

                    <span className="my-1.5 block h-px bg-slate-200 dark:bg-slate-700" />

                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        void logout();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 dark:text-slate-200 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                    >
                      <LogOut size={18} className="text-rose-500" />
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
