import { describe, it, expect } from 'vitest';
import { checksForUpdates, storedUpdateCheck } from '../update-check';

describe('checksForUpdates', () => {
  it('is on unless the setting is false', () => {
    expect(checksForUpdates(undefined)).toBe(true);
    expect(checksForUpdates(true)).toBe(true);
    expect(checksForUpdates('no')).toBe(true);
    expect(checksForUpdates(false)).toBe(false);
  });
});

describe('storedUpdateCheck', () => {
  it('stores false to turn it off, and removes the key to turn it on', () => {
    expect(storedUpdateCheck(false)).toBe(false);
    expect(storedUpdateCheck(true)).toBeUndefined();
  });
});
