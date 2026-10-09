import type { PageKindDefinition, PageKindField, PagePropertyValue } from '$shared/types/pages';

/** A kind's display name; a key the notebook no longer has shows as itself. */
export const kindName = (kinds: readonly Pick<PageKindDefinition, 'key' | 'name'>[], key: string): string =>
  kinds.find((k) => k.key === key)?.name ?? key;

/** `SUPERSEDED` → `Superseded`. Options written in mixed case (`iPhone`, `Food`) show as written. */
export const optionLabel = (option: string): string =>
  /^[A-Z0-9_]+$/.test(option) ? option.charAt(0) + option.slice(1).toLowerCase().replace(/_/g, ' ') : option;

const formatDay = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** A number as its field shows it: money with its currency, otherwise grouped digits. */
export const formatNumber = (field: PageKindField, value: number): string => {
  if (field.format === 'money') {
    try {
      return value.toLocaleString(undefined, { style: 'currency', currency: field.currency ?? 'USD' });
    } catch {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export const formatPropertyValue = (field: PageKindField, value: PagePropertyValue): string => {
  if (Array.isArray(value)) return value.map(optionLabel).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumber(field, value);
  if (field.input === 'select') return optionLabel(value as string);
  if (field.input === 'date') return formatDay(value as string);
  return String(value);
};
