import { describe, it, expect } from 'vitest';
import { emptyRow, fieldKeyFromLabel, kindKeyFromName, toField, toRow } from '../kind-form';

describe('kind form', () => {
  it('makes keys from names', () => {
    expect(kindKeyFromName('Home item')).toBe('HOME_ITEM');
    expect(kindKeyFromName(' 2026 taxes! ')).toBe('TAXES');
    expect(fieldKeyFromLabel('Next due date')).toBe('nextDueDate');
    expect(fieldKeyFromLabel('URL')).toBe('url');
  });

  it('turns a row into a field, keeping only the settings its type uses', () => {
    expect(toField({ ...emptyRow(), key: 'kind', label: 'Kind', input: 'select', options: ' Rent, Food ,, ' }))
      .toEqual({ key: 'kind', label: 'Kind', input: 'select', options: ['Rent', 'Food'] });
    expect(toField({ ...emptyRow(), key: 'amount', label: 'Amount', input: 'number', format: 'money', currency: 'gbp', options: 'x' }))
      .toEqual({ key: 'amount', label: 'Amount', input: 'number', format: 'money', currency: 'GBP' });
    expect(toField({ ...emptyRow(), key: 'note', label: 'Note', input: 'text', format: 'money' }))
      .toEqual({ key: 'note', label: 'Note', input: 'text' });
  });

  it('round-trips a field through a row', () => {
    const field = { key: 'tags', label: 'Tags', input: 'multiselect' as const, options: ['A', 'B'] };
    expect(toField(toRow(field))).toEqual(field);
  });
});
