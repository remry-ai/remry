import { describe, it, expect } from 'vitest';
import { fieldPatch, fieldRaw, fieldText } from '../fields';
import { ORG_MODULE } from '$shared/modules/org';
import { PERSONAL_MODULE } from '$shared/modules/personal';

const [title, lead] = ORG_MODULE.personFields as [never, never];
const [knownAs, birthday] = PERSONAL_MODULE.personFields as [never, never];
const extensions = {
  org: { title: 'Staff Engineer', leadId: 'p2', leadName: 'Alice' },
  personal: { birthday: '--05-03', knownAs: '' }
};

describe('person fields', () => {
  it('reads and shows module fields', () => {
    expect(fieldRaw(extensions, title)).toBe('Staff Engineer');
    expect(fieldText(extensions, lead)).toBe('Alice');
    expect(fieldText(extensions, birthday)).toBe('3 May');
    expect(fieldRaw(extensions, knownAs)).toBeNull();
    expect(fieldText({}, title)).toBeNull();
  });

  it('builds a patch under the module', () => {
    expect(fieldPatch(title, 'CTO')).toEqual({ org: { title: 'CTO' } });
    expect(fieldPatch(birthday, null)).toEqual({ personal: { birthday: null } });
  });
});
