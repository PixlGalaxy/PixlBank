import type { TranslationKey } from '../../i18n/translations';
import { useI18n } from '../../i18n/I18nContext';

/** A row of mutually exclusive options, like a segmented control. */
const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; labelKey: TranslationKey }[];
  onChange: (v: T) => void;
}) => {
  const { t } = useI18n();
  return (
    <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
            value === o.value
              ? 'bg-[var(--accent-600)] text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
};

export default Segmented;
