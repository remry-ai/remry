import { describe, it, expect } from 'vitest';
import { nowrapColumns } from '../table-columns';

describe('nowrapColumns', () => {
  it('keeps short columns on one line beside a long-text column', () => {
    expect(nowrapColumns([
      ['Vendor', 'Renewal', 'Owner', 'Notes'],
      ['Stripe', '2027-03-01', 'Dana Park', 'Volume discount applies once we pass 2M transactions a month'],
      ['Linear', '2026-12-15', 'Alice Johnson', 'Monthly billing']
    ])).toEqual([true, true, true, false]);
  });

  it('leaves a table of short columns to the browser', () => {
    expect(nowrapColumns([['A', 'B'], ['one', 'two']])).toEqual([false, false]);
  });

  it('handles ragged rows and an empty table', () => {
    expect(nowrapColumns([['Name', 'Description'], ['x']])).toEqual([false, false]);
    expect(nowrapColumns([['Name'], ['x', 'a description much longer than twenty-four characters']])).toEqual([true, false]);
    expect(nowrapColumns([])).toEqual([]);
  });
});
