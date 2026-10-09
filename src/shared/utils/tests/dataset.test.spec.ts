import { describe, it, expect } from 'vitest';
import {
  aggregate,
  filterRows,
  formatFilter,
  groupRows,
  parseAggregate,
  parseFilter,
  parseGroupBy,
  parseSort,
  sortRows,
  totalsFor,
  type DatasetRow
} from '../dataset';
import type { PageKindField, PageProperties } from '$shared/types/pages';

const FIELDS: readonly PageKindField[] = [
  { key: 'amount', label: 'Amount', input: 'number', format: 'money', currency: 'USD' },
  { key: 'frequency', label: 'Frequency', input: 'select', options: ['MONTHLY', 'YEARLY'] },
  { key: 'tags', label: 'Tags', input: 'multiselect', options: ['Home', 'Fun'] },
  { key: 'autopay', label: 'Autopay', input: 'checkbox' },
  { key: 'nextDue', label: 'Next due', input: 'date' },
  { key: 'notes', label: 'Notes', input: 'text' }
];

const row = (id: string, properties: PageProperties): DatasetRow => ({ id, title: id, properties, updatedAt: new Date('2026-10-01T00:00:00Z') });

const ROWS = [
  row('Rent', { amount: 1500, frequency: 'MONTHLY', tags: ['Home'], autopay: true, nextDue: '2026-11-01' }),
  row('Netflix', { amount: 15.5, frequency: 'MONTHLY', tags: ['Fun', 'Home'], nextDue: '2026-10-20' }),
  row('Car insurance', { amount: 900, frequency: 'YEARLY', autopay: false, nextDue: '2027-03-01', notes: 'Renew via broker' }),
  row('Gift', {})
];

const parse = (text: string) => {
  const result = parseFilter(FIELDS, text);
  if (!result.ok) throw result.error;
  return result.value;
};

const ids = (rows: readonly DatasetRow[]) => rows.map((r) => r.id);

describe('parsing', () => {
  it('reads filters and writes them back', () => {
    expect(parse('tags:anyOf:Home|Fun')).toEqual({ field: 'tags', op: 'anyOf', values: ['Home', 'Fun'] });
    expect(parse('notes:contains:a:b')).toEqual({ field: 'notes', op: 'contains', values: ['a:b'] });
    expect(formatFilter(parse('frequency:is:MONTHLY'))).toBe('frequency:is:MONTHLY');
    expect(formatFilter(parse('notes:empty'))).toBe('notes:empty');
  });

  it('names what is wrong', () => {
    const message = (text: string) => { const r = parseFilter(FIELDS, text); return r.ok ? 'ok' : r.error.message; };
    expect(message('colour:is:red')).toContain('there is no field "colour"');
    expect(message('autopay:contains:x')).toContain('a checkbox field takes is, not');
    expect(message('amount:gte:lots')).toContain('amount is a number');
    expect(message('amount:gte')).toContain('give a value');
    expect(parseSort(FIELDS, 'amount:sideways').ok).toBe(false);
    expect(parseAggregate(FIELDS, 'notes:sum').ok).toBe(false);
    expect(parseAggregate(FIELDS, 'amount:median').ok).toBe(false);
    expect(parseGroupBy(FIELDS, 'amount').ok).toBe(false);
    expect(parseGroupBy(FIELDS, 'frequency').ok).toBe(true);
  });
});

describe('filterRows', () => {
  it('matches each op', () => {
    const run = (...texts: string[]) => ids(filterRows(FIELDS, ROWS, texts.map(parse)));
    expect(run('frequency:is:monthly')).toEqual(['Rent', 'Netflix']);
    expect(run('frequency:not:MONTHLY')).toEqual(['Car insurance', 'Gift']);
    expect(run('tags:anyOf:Fun')).toEqual(['Netflix']);
    expect(run('amount:gte:100', 'amount:lte:1000')).toEqual(['Car insurance']);
    expect(run('nextDue:lte:2026-12-31')).toEqual(['Rent', 'Netflix']);
    expect(run('autopay:is:true')).toEqual(['Rent']);
    expect(run('autopay:is:false')).toEqual(['Netflix', 'Car insurance', 'Gift']);
    expect(run('notes:contains:BROKER')).toEqual(['Car insurance']);
    expect(run('amount:empty')).toEqual(['Gift']);
    expect(run('title:contains:net')).toEqual(['Netflix']);
  });
});

describe('sortRows', () => {
  it('sorts by numbers and text, with empty values last either way', () => {
    expect(ids(sortRows(ROWS, { field: 'amount', dir: 'desc' }))).toEqual(['Rent', 'Car insurance', 'Netflix', 'Gift']);
    expect(ids(sortRows(ROWS, { field: 'amount', dir: 'asc' }))).toEqual(['Netflix', 'Car insurance', 'Rent', 'Gift']);
    expect(ids(sortRows(ROWS, { field: 'title', dir: 'asc' }))).toEqual(['Car insurance', 'Gift', 'Netflix', 'Rent']);
    expect(sortRows(ROWS, null)).toBe(ROWS);
  });
});

describe('totals and groups', () => {
  it('aggregates numbers and ignores rows without one', () => {
    expect(aggregate(ROWS, { field: 'amount', fn: 'sum' })).toBe(2415.5);
    expect(aggregate(ROWS, { field: 'amount', fn: 'avg' })).toBeCloseTo(805.17, 2);
    expect(aggregate(ROWS, { field: 'amount', fn: 'min' })).toBe(15.5);
    expect(aggregate([], { field: 'amount', fn: 'max' })).toBeNull();
    expect(totalsFor(ROWS, [{ field: 'amount', fn: 'max' }])).toEqual({ 'amount:max': 1500 });
  });

  it('groups in option order with the empty group last, and a multiselect row in each of its groups', () => {
    const byFrequency = groupRows(FIELDS[1]!, ROWS, [{ field: 'amount', fn: 'sum' }]);
    expect(byFrequency.map((g) => [g.value, g.count, g.totals['amount:sum']])).toEqual([
      ['MONTHLY', 2, 1515.5],
      ['YEARLY', 1, 900],
      [null, 1, null]
    ]);
    const byTag = groupRows(FIELDS[2]!, ROWS, []);
    expect(byTag.map((g) => [g.value, ids(g.rows)])).toEqual([
      ['Home', ['Rent', 'Netflix']],
      ['Fun', ['Netflix']],
      [null, ['Car insurance', 'Gift']]
    ]);
    expect(groupRows(FIELDS[3]!, ROWS, []).map((g) => [g.value, g.count])).toEqual([['false', 3], ['true', 1]]);
  });
});
