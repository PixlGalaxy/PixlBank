import { AlertTriangle, FileSearch } from 'lucide-react';
import type { ReceiptMetadata } from '../../api/loans';
import { useI18n } from '../../i18n/I18nContext';
import { formatDate } from '../../lib/money';

/** Apps whose name on a receipt means it went through an image editor. */
const EDITORS = /photoshop|gimp|picsart|snapseed|canva|lightroom|pixelmator|affinity|paint|fotor|photoroom|polarr|facetune|vsco|inshot|meitu/i;

/** Device-written stamps ("2026-10-08 09:15:30-05:00") shown as-is: the date localized, the wall-clock time kept. */
function stamp(value: string, language: string): string {
  const time = value.slice(11, 16);
  const zone = value.slice(19);
  return `${formatDate(value, language)}${time ? ` ${time}` : ''}${zone ? ` (${zone === 'Z' ? 'UTC' : zone})` : ''}`;
}

/** What the receipt image says about itself, with the few things worth a second look called out. */
const ReceiptMetadataPanel = ({ meta, paidOn }: { meta: ReceiptMetadata; paidOn: string }) => {
  const { t, language } = useI18n();

  const editor = meta.software && EDITORS.test(meta.software) ? meta.software : null;
  // Minute precision: some apps rewrite the stamp a few seconds after capture.
  const modifiedAfter = Boolean(meta.createdAt && meta.modifiedAt && meta.modifiedAt.slice(0, 16) > meta.createdAt.slice(0, 16));
  const beforePayment = Boolean(meta.createdAt && meta.createdAt.slice(0, 10) < paidOn);
  const empty = !meta.createdAt && !meta.modifiedAt && !meta.software && !meta.device;

  const warnings = [
    editor && t('payments.metaEdited', { software: editor }),
    modifiedAfter && t('payments.metaModifiedAfter'),
    beforePayment && t('payments.metaBeforePayment'),
  ].filter((w): w is string => Boolean(w));

  const row = (name: string, value: string | null, highlight = false) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-slate-500 dark:text-slate-400">{name}</dt>
      <dd className={`text-right font-medium ${highlight ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
        {value ?? '—'}
      </dd>
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <span className="mb-2 flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
        <FileSearch size={16} className="text-[var(--accent-500)]" /> {t('payments.metaTitle')}
      </span>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {row(t('payments.metaCreated'), meta.createdAt && stamp(meta.createdAt, language), beforePayment)}
        {row(t('payments.metaModified'), meta.modifiedAt && stamp(meta.modifiedAt, language), modifiedAfter)}
        {row(t('payments.metaSoftware'), meta.software, Boolean(editor))}
        {row(t('payments.metaDevice'), meta.device)}
        {row(
          t('payments.metaFileModified'),
          meta.fileModifiedAt &&
            new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(meta.fileModifiedAt)),
        )}
      </dl>
      {warnings.map((w) => (
        <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {w}
        </p>
      ))}
      {empty && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{t('payments.metaNone')}</p>}
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{t('payments.metaAdvisory')}</p>
    </div>
  );
};

export default ReceiptMetadataPanel;
