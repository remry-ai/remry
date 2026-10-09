// PageKindForm's pure parts: keys made from names, and the editable rows of a
// kind's fields turned back into field definitions.

import type { NumberFormat, PageFieldInput, PageKindField } from '$shared/types/pages';

/** "Home item" → HOME_ITEM. */
export const kindKeyFromName = (name: string): string =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^[^A-Z]+/, '').replace(/_+$/, '').slice(0, 40);

/** "Next due" → nextDue. */
export const fieldKeyFromLabel = (label: string): string => {
  const words = label.trim().replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('');
  return key.replace(/^[^a-z]+/, '').slice(0, 40);
};

/** A field as the form edits it: options as one comma-separated string. */
export interface FieldRow {
  key: string;
  label: string;
  input: PageFieldInput;
  options: string;
  format: NumberFormat;
  currency: string;
  /** False once the key was saved or typed by hand, so renaming the label leaves it alone. */
  autoKey: boolean;
}

export const toRow = (field: PageKindField): FieldRow => ({
  key: field.key,
  label: field.label,
  input: field.input,
  options: (field.options ?? []).join(', '),
  format: field.format ?? 'plain',
  currency: field.currency ?? '',
  autoKey: false
});

export const emptyRow = (): FieldRow => ({ key: '', label: '', input: 'text', options: '', format: 'plain', currency: '', autoKey: true });

export const toField = (row: FieldRow): PageKindField => {
  const options = row.options.split(',').map((o) => o.trim()).filter(Boolean);
  const choice = row.input === 'select' || row.input === 'multiselect';
  const money = row.input === 'number' && row.format === 'money';
  return {
    key: row.key.trim(),
    label: row.label.trim(),
    input: row.input,
    ...(choice ? { options } : {}),
    ...(money ? { format: 'money' as const, ...(row.currency.trim() ? { currency: row.currency.trim().toUpperCase() } : {}) } : {})
  };
};
