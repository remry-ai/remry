// A page kind's pages as a dataset: filter, sort, group and total them by the
// kind's fields. Pure, and shared: page.query runs it on the server, and the
// wiki table reads and writes the same string forms in its URL.
//
//   filter     field:op[:value]       frequency:is:MONTHLY, category:anyOf:Food|Rent,
//                                     amount:gte:100, nextDue:lte:2026-12-31, url:empty
//   sort       field[:asc|desc]       amount:desc
//   aggregate  field:fn               amount:sum (count needs no field)

import { ok, err, type Result } from './result';
import type { PageKindField, PageProperties, PagePropertyValue } from '$shared/types/pages';

export const FILTER_OPS = ['is', 'not', 'anyOf', 'contains', 'gte', 'lte', 'empty', 'set'] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

export const AGGREGATE_FNS = ['sum', 'avg', 'min', 'max'] as const;

export type AggregateFn = (typeof AGGREGATE_FNS)[number];

export interface DatasetFilter {
  readonly field: string;
  readonly op: FilterOp;
  readonly values: readonly string[];
}

export interface DatasetSort {
  readonly field: string;
  readonly dir: 'asc' | 'desc';
}

export interface DatasetAggregate {
  readonly field: string;
  readonly fn: AggregateFn;
}

/** What a dataset needs from a page. */
export interface DatasetRow {
  readonly id: string;
  readonly title: string;
  readonly properties: PageProperties;
  readonly updatedAt: Date;
}

export interface DatasetGroup<T extends DatasetRow> {
  /** The group's value; null collects rows with none. */
  readonly value: string | null;
  readonly rows: readonly T[];
  readonly count: number;
  /** Keyed `field:fn`; null when no row has a number to total. */
  readonly totals: Readonly<Record<string, number | null>>;
}

/** Fields every page has, beside its kind's: they filter and sort like text and dates. */
const BUILT_IN_FIELDS: readonly PageKindField[] = [
  { key: 'title', label: 'Title', input: 'text' },
  { key: 'updatedAt', label: 'Updated', input: 'date' }
];

const OPS_BY_INPUT: Readonly<Record<PageKindField['input'], readonly FilterOp[]>> = {
  text: ['is', 'not', 'anyOf', 'contains', 'empty', 'set'],
  url: ['is', 'not', 'contains', 'empty', 'set'],
  number: ['is', 'not', 'gte', 'lte', 'empty', 'set'],
  date: ['is', 'not', 'gte', 'lte', 'empty', 'set'],
  select: ['is', 'not', 'anyOf', 'empty', 'set'],
  multiselect: ['is', 'not', 'anyOf', 'empty', 'set'],
  checkbox: ['is', 'not']
};

export const filterOpsFor = (field: PageKindField): readonly FilterOp[] => OPS_BY_INPUT[field.input];

/** Inputs a table can group by: each row lands in one group per value. */
export const canGroupBy = (field: PageKindField): boolean =>
  field.input === 'select' || field.input === 'multiselect' || field.input === 'checkbox' || field.input === 'text';

const allFields = (fields: readonly PageKindField[]): readonly PageKindField[] => [...BUILT_IN_FIELDS, ...fields];

const findField = (fields: readonly PageKindField[], key: string): Result<PageKindField> => {
  const field = allFields(fields).find((f) => f.key === key);
  return field
    ? ok(field)
    : err(new Error(`there is no field "${key}". Fields: ${allFields(fields).map((f) => f.key).join(', ')}`));
};

// ----- Parsing the string forms -----

export const parseFilter = (fields: readonly PageKindField[], text: string): Result<DatasetFilter> => {
  const [key = '', op = '', ...rest] = text.split(':');
  const field = findField(fields, key);
  if (!field.ok) return err(new Error(`filter "${text}": ${field.error.message}`));
  const ops = filterOpsFor(field.value);
  if (!(ops as readonly string[]).includes(op)) {
    return err(new Error(`filter "${text}": a ${field.value.input} field takes ${ops.join(', ')}`));
  }
  const value = rest.join(':');
  const needsValue = op !== 'empty' && op !== 'set';
  if (needsValue && value === '') return err(new Error(`filter "${text}": give a value after ${key}:${op}:`));
  const values = !needsValue ? [] : op === 'anyOf' ? value.split('|').filter(Boolean) : [value];
  if (field.value.input === 'number' && values.some((v) => Number.isNaN(Number(v)))) {
    return err(new Error(`filter "${text}": ${key} is a number`));
  }
  if (field.value.input === 'checkbox' && values.some((v) => v !== 'true' && v !== 'false')) {
    return err(new Error(`filter "${text}": ${key} is a checkbox, so the value is true or false`));
  }
  return ok({ field: key, op: op as FilterOp, values });
};

export const formatFilter = (filter: DatasetFilter): string =>
  [filter.field, filter.op, ...(filter.values.length > 0 ? [filter.values.join('|')] : [])].join(':');

export const parseSort = (fields: readonly PageKindField[], text: string): Result<DatasetSort> => {
  const [key = '', dir = 'asc'] = text.split(':');
  const field = findField(fields, key);
  if (!field.ok) return err(new Error(`sort "${text}": ${field.error.message}`));
  if (dir !== 'asc' && dir !== 'desc') return err(new Error(`sort "${text}": the direction is asc or desc`));
  return ok({ field: key, dir });
};

export const parseAggregate = (fields: readonly PageKindField[], text: string): Result<DatasetAggregate> => {
  const [key = '', fn = ''] = text.split(':');
  const field = fields.find((f) => f.key === key);
  const numbers = fields.filter((f) => f.input === 'number').map((f) => f.key);
  if (!field || field.input !== 'number') {
    return err(new Error(`aggregate "${text}": totals work on number fields (${numbers.join(', ') || 'this kind has none'})`));
  }
  if (!(AGGREGATE_FNS as readonly string[]).includes(fn)) {
    return err(new Error(`aggregate "${text}": the function is one of ${AGGREGATE_FNS.join(', ')}`));
  }
  return ok({ field: key, fn: fn as AggregateFn });
};

export const parseGroupBy = (fields: readonly PageKindField[], key: string): Result<PageKindField> => {
  const field = fields.find((f) => f.key === key);
  if (field && canGroupBy(field)) return ok(field);
  const choices = fields.filter(canGroupBy).map((f) => f.key);
  return err(new Error(`group by "${key}": group by a select, multiselect, checkbox or text field (${choices.join(', ') || 'this kind has none'})`));
};

// ----- Reading values -----

const valueOf = (row: DatasetRow, key: string): PagePropertyValue | undefined => {
  if (key === 'title') return row.title;
  if (key === 'updatedAt') return row.updatedAt.toISOString().slice(0, 10);
  return row.properties[key];
};

const isEmpty = (value: PagePropertyValue | undefined): boolean =>
  value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

const asStrings = (value: PagePropertyValue | undefined): readonly string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [String(value)];

const compareValues = (a: PagePropertyValue, b: PagePropertyValue): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return asStrings(a).join(', ').localeCompare(asStrings(b).join(', '), undefined, { numeric: true, sensitivity: 'base' });
};

// ----- Filter, sort, group, total -----

const matches = (row: DatasetRow, field: PageKindField, filter: DatasetFilter): boolean => {
  const value = valueOf(row, filter.field);
  const target = filter.values[0] ?? '';
  switch (filter.op) {
    case 'empty':
      return isEmpty(value);
    case 'set':
      return !isEmpty(value);
    case 'is':
    case 'not': {
      const hit = field.input === 'number'
        ? typeof value === 'number' && value === Number(target)
        : field.input === 'checkbox'
          ? (value === true) === (target === 'true')
          : asStrings(value).some((v) => v.toLowerCase() === target.toLowerCase());
      return filter.op === 'is' ? hit : !hit;
    }
    case 'anyOf': {
      const wanted = new Set(filter.values.map((v) => v.toLowerCase()));
      return asStrings(value).some((v) => wanted.has(v.toLowerCase()));
    }
    case 'contains':
      return asStrings(value).some((v) => v.toLowerCase().includes(target.toLowerCase()));
    case 'gte':
    case 'lte': {
      if (isEmpty(value)) return false;
      const order = field.input === 'number' ? Number(value) - Number(target) : String(value).localeCompare(target);
      return filter.op === 'gte' ? order >= 0 : order <= 0;
    }
  }
};

export const filterRows = <T extends DatasetRow>(
  fields: readonly PageKindField[],
  rows: readonly T[],
  filters: readonly DatasetFilter[]
): readonly T[] => {
  const all = allFields(fields);
  return rows.filter((row) =>
    filters.every((filter) => {
      const field = all.find((f) => f.key === filter.field);
      return field ? matches(row, field, filter) : true;
    })
  );
};

/** Empty values sort last in either direction. */
export const sortRows = <T extends DatasetRow>(rows: readonly T[], sort: DatasetSort | null): readonly T[] => {
  if (!sort) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueOf(a, sort.field);
    const vb = valueOf(b, sort.field);
    if (isEmpty(va) || isEmpty(vb)) return isEmpty(va) === isEmpty(vb) ? 0 : isEmpty(va) ? 1 : -1;
    return sign * compareValues(va as PagePropertyValue, vb as PagePropertyValue);
  });
};

export const aggregate = (rows: readonly DatasetRow[], agg: DatasetAggregate): number | null => {
  const numbers = rows.map((row) => row.properties[agg.field]).filter((v): v is number => typeof v === 'number');
  if (numbers.length === 0) return null;
  switch (agg.fn) {
    case 'sum':
      return numbers.reduce((total, n) => total + n, 0);
    case 'avg':
      return numbers.reduce((total, n) => total + n, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
  }
};

export const aggregateKey = (agg: DatasetAggregate): string => `${agg.field}:${agg.fn}`;

export const totalsFor = (
  rows: readonly DatasetRow[],
  aggregates: readonly DatasetAggregate[]
): Readonly<Record<string, number | null>> =>
  Object.fromEntries(aggregates.map((agg) => [aggregateKey(agg), aggregate(rows, agg)]));

/**
 * Groups rows by a field's values, in the field's option order (then by value),
 * with rows that have none last. A multiselect row lands in each of its groups.
 */
export const groupRows = <T extends DatasetRow>(
  field: PageKindField,
  rows: readonly T[],
  aggregates: readonly DatasetAggregate[]
): readonly DatasetGroup<T>[] => {
  const buckets = new Map<string | null, T[]>();
  for (const row of rows) {
    const value = row.properties[field.key];
    const keys = field.input === 'checkbox' ? [value === true ? 'true' : 'false'] : isEmpty(value) ? [null] : asStrings(value);
    for (const key of keys) buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const order: readonly string[] = field.options ?? [];
  const rank = (key: string | null): number => (key === null ? Infinity : order.includes(key) ? order.indexOf(key) : order.length);
  return [...buckets.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || String(a).localeCompare(String(b)))
    .map(([value, groupRows]) => ({ value, rows: groupRows, count: groupRows.length, totals: totalsFor(groupRows, aggregates) }));
};
