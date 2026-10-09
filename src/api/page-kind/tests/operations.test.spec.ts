import { describe, it, expect } from 'vitest';
import { fitProperties, planFieldChange } from '../operations';
import type { PageKindField, PageProperties } from '$shared/types/pages';

const BEFORE: readonly PageKindField[] = [
  { key: 'amount', label: 'Amount', input: 'number' },
  { key: 'frequency', label: 'Frequency', input: 'select', options: ['MONTHLY', 'YEARLY', 'WEEKLY'] },
  { key: 'notes', label: 'Notes', input: 'text' }
];

const PAGES: readonly { id: string; title: string; properties: PageProperties }[] = [
  { id: 'p1', title: 'Rent', properties: { amount: 1500, frequency: 'MONTHLY', notes: 'Landlord' } },
  { id: 'p2', title: 'Insurance', properties: { frequency: 'YEARLY' } }
];

const message = (after: readonly PageKindField[]): string => {
  const result = planFieldChange(BEFORE, after, PAGES);
  return result.ok ? 'ok' : result.error.message;
};

describe('planFieldChange', () => {
  it('allows new fields and options, and counts the pages a removed field clears', () => {
    const result = planFieldChange(BEFORE, [
      BEFORE[0]!,
      { key: 'frequency', label: 'Frequency', input: 'select', options: ['MONTHLY', 'YEARLY', 'QUARTERLY'] },
      { key: 'paidFrom', label: 'Paid from', input: 'text' }
    ], PAGES);
    expect(result).toEqual({ ok: true, value: { removed: ['notes'], pagesChanged: 1 } });
  });

  it('refuses to drop an option a page uses, naming the pages', () => {
    expect(message([BEFORE[0]!, { key: 'frequency', label: 'Frequency', input: 'select', options: ['MONTHLY'] }, BEFORE[2]!]))
      .toContain('lose the option(s) YEARLY, which 1 page(s) use ("Insurance")');
  });

  it('refuses to change the type of a field with values, but lets a select become a multiselect', () => {
    expect(message([{ key: 'amount', label: 'Amount', input: 'text' }, BEFORE[1]!, BEFORE[2]!])).toContain('amount is a number field and 1 page(s)');
    expect(message([BEFORE[0]!, { key: 'frequency', label: 'Frequency', input: 'multiselect', options: ['MONTHLY', 'YEARLY'] }, BEFORE[2]!])).toBe('ok');
    expect(message([BEFORE[0]!, BEFORE[1]!, { key: 'notes', label: 'Notes', input: 'url' }])).toContain('notes is a text field');
  });
});

describe('fitProperties', () => {
  it('keeps the values that fit the new fields and drops the rest', () => {
    const after: readonly PageKindField[] = [
      { key: 'amount', label: 'Amount', input: 'number' },
      { key: 'frequency', label: 'Frequency', input: 'multiselect', options: ['MONTHLY'] }
    ];
    expect(fitProperties(after, { amount: 1500, frequency: 'MONTHLY', notes: 'x' })).toEqual({ amount: 1500, frequency: ['MONTHLY'] });
    expect(fitProperties(after, { amount: 'lots', frequency: 'YEARLY' })).toEqual({});
  });
});
