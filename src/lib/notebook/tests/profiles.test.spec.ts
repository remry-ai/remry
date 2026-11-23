import { describe, it, expect } from 'vitest';
import { NOTEBOOK_PROFILES } from '$shared/types/notebook';
import { PROFILE_OPTIONS, profileHint } from '../profiles';

describe('PROFILE_OPTIONS', () => {
  it('offers every profile, work first', () => {
    expect(PROFILE_OPTIONS.map((o) => o.id)).toEqual([...NOTEBOOK_PROFILES]);
    expect(PROFILE_OPTIONS[0]?.id).toBe('work');
  });

  it('says what each profile adds', () => {
    expect(profileHint('work')).toMatch(/org map/);
    expect(profileHint('home')).toMatch(/Birthdays/);
  });
});
