import { describe, it, expect } from 'vitest';
import { planRevocation, renderRevokedFile } from '../revoke-list';

const entry = (id: string, expires: string) => ({ id, expires, note: '2026-10-05 refund' });

describe('planRevocation', () => {
  it('adds a license, keeping the list in expiry order', () => {
    const plan = planRevocation([entry('b', '2027-12-01')], entry('a', '2027-10-03'), '2026-10-05');
    expect(plan.ok && plan.value.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('drops entries whose keys have expired, so the list stays short', () => {
    const plan = planRevocation([entry('old', '2026-10-04'), entry('live', '2026-10-05')], null, '2026-10-05');
    expect(plan.ok && plan.value.entries.map((e) => e.id)).toEqual(['live']);
    expect(plan.ok && plan.value.pruned.map((e) => e.id)).toEqual(['old']);
  });

  it('moves an already revoked license to a later expiry, for a renewal, but not an earlier one', () => {
    const later = planRevocation([entry('a', '2027-10-03')], entry('a', '2028-10-03'), '2026-10-05');
    expect(later.ok && later.value.entries).toEqual([entry('a', '2028-10-03')]);
    expect(planRevocation([entry('a', '2027-10-03')], entry('a', '2027-10-03'), '2026-10-05').ok).toBe(false);
  });

  it("refuses ids and dates that aren't", () => {
    expect(planRevocation([], entry("x'); evil()", '2027-10-03'), '2026-10-05').ok).toBe(false);
    expect(planRevocation([], entry('a', 'next year'), '2026-10-05').ok).toBe(false);
  });
});

describe('renderRevokedFile', () => {
  it('writes the entries as data, with notes on one line', () => {
    const source = renderRevokedFile([{ id: 'abc', expires: '2027-10-03', note: 'charge\nback' }]);
    expect(source).toContain('  { id: "abc", expires: "2027-10-03", note: "charge back" },');
    expect(source).toContain('export const REVOKED_LICENSE_IDS');
  });

  it('writes an empty list when nothing is revoked', () => {
    expect(renderRevokedFile([])).toContain('export const REVOKED_LICENSES: readonly RevokedLicense[] = [];');
  });
});
