import { describe, it, expect } from 'vitest';
import {
  GENERAL_KIND,
  STARTER_KINDS,
  pageKindFieldsSchema,
  parsePageProperties,
  readPageKindFields,
  readPageProperties,
  type PageKindDefinition
} from '../pages';

const kind = (key: string): PageKindDefinition => {
  const found = STARTER_KINDS.find((k) => k.key === key);
  if (!found) throw new Error(key);
  return { ...found, sortOrder: 0 };
};

const EXPENSE: PageKindDefinition = {
  key: 'EXPENSE',
  name: 'Expense',
  description: null,
  sortOrder: 0,
  fields: [
    { key: 'amount', label: 'Amount', input: 'number', format: 'money', currency: 'USD' },
    { key: 'tags', label: 'Tags', input: 'multiselect', options: ['Home', 'Car', 'Fun'] },
    { key: 'autopay', label: 'Autopay', input: 'checkbox' }
  ]
};

describe('parsePageProperties', () => {
  it('accepts valid properties for the kind', () => {
    const result = parsePageProperties(kind('SOFTWARE'), {
      vendor: 'Acme',
      url: 'https://acme.test',
      annualCost: 1200,
      renewalDate: '2027-01-31'
    });
    expect(result.ok && result.value).toEqual({ vendor: 'Acme', url: 'https://acme.test', annualCost: 1200, renewalDate: '2027-01-31' });
  });

  it('accepts the properties as JSON', () => {
    expect(parsePageProperties(kind('POLICY'), '{"status":"ACTIVE","version":"2"}').ok).toBe(true);
  });

  it('rejects keys the kind does not have and lists the allowed ones', () => {
    const result = parsePageProperties(kind('POLICY'), { vendor: 'Acme' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("'vendor'");
    expect(result.error.message).toContain('allowed keys: status, version, effectiveDate, reviewDate');
  });

  it('names each bad value', () => {
    const result = parsePageProperties(kind('SOFTWARE'), { seats: 'ten', renewalDate: 'next year' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('seats');
    expect(result.error.message).toContain('renewalDate must be a date like 2026-09-13');
  });

  it('rejects an option the select does not offer', () => {
    expect(parsePageProperties(kind('DECISION'), { status: 'LIVE' }).ok).toBe(false);
  });

  it('gives GENERAL pages no properties', () => {
    const result = parsePageProperties(GENERAL_KIND, { owner: 'x' });
    expect(!result.ok && result.error.message).toContain('this kind has no properties');
  });

  it('takes multiselect lists, checkboxes and negative money', () => {
    expect(parsePageProperties(EXPENSE, { amount: -12.5, tags: ['Home', 'Car'], autopay: true }).ok).toBe(true);
    expect(parsePageProperties(EXPENSE, { tags: ['Boat'] }).ok).toBe(false);
    expect(parsePageProperties(EXPENSE, { tags: ['Home', 'Home'] }).ok).toBe(false);
    expect(parsePageProperties(EXPENSE, { autopay: 'yes' }).ok).toBe(false);
  });
});

describe('page kind fields', () => {
  it('accepts the starter kinds', () => {
    for (const k of STARTER_KINDS) expect(pageKindFieldsSchema.safeParse(k.fields).success).toBe(true);
  });

  it('rejects duplicate keys, choices without options and misplaced money settings', () => {
    const bad = (fields: unknown) => !pageKindFieldsSchema.safeParse(fields).success;
    expect(bad([{ key: 'a', label: 'A', input: 'text' }, { key: 'a', label: 'B', input: 'text' }])).toBe(true);
    expect(bad([{ key: 'kind', label: 'Kind', input: 'select' }])).toBe(true);
    expect(bad([{ key: 'kind', label: 'Kind', input: 'text', options: ['x'] }])).toBe(true);
    expect(bad([{ key: 'note', label: 'Note', input: 'text', format: 'money' }])).toBe(true);
    expect(bad([{ key: 'cost', label: 'Cost', input: 'number', currency: 'USD' }])).toBe(true);
    expect(bad([{ key: 'Cost', label: 'Cost', input: 'number' }])).toBe(true);
  });

  it('reads unreadable fields as none', () => {
    expect(readPageKindFields('nope')).toEqual([]);
    expect(readPageKindFields(JSON.stringify(EXPENSE.fields))).toEqual(EXPENSE.fields);
  });
});

describe('readPageProperties', () => {
  it('reads unreadable or non-object JSON as no properties', () => {
    expect(readPageProperties('not json')).toEqual({});
    expect(readPageProperties('[1,2]')).toEqual({});
    expect(readPageProperties('{"vendor":"Acme"}')).toEqual({ vendor: 'Acme' });
  });
});
