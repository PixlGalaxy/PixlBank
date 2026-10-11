import { useI18n } from '../../i18n/I18nContext';

/** Totals are never summed across currencies, so multi-currency views pick one at a time. */
const CurrencyTabs = ({ currencies, value, onChange }: { currencies: string[]; value: string; onChange: (c: string) => void }) => {
  const { t } = useI18n();
  if (currencies.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('loans.currency')}</span>
      <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {currencies.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${
              c === value
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CurrencyTabs;
