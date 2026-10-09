import { describe, it, expect } from 'vitest';
import { licensePeriod } from '../period';
import { publicKeyModule } from '../key-file';

describe('licensePeriod', () => {
  const today = new Date('2026-10-04T15:00:00Z');

  it('runs a year from today, through the day before the anniversary', () => {
    expect(licensePeriod({ months: 12, today })).toEqual({ ok: true, value: { issued: '2026-10-04', expires: '2027-10-03' } });
  });

  it('starts a renewal where the old license ends', () => {
    expect(licensePeriod({ from: '2027-10-04', months: 12, today })).toEqual({ ok: true, value: { issued: '2027-10-04', expires: '2028-10-03' } });
  });

  it('handles month ends and leap years', () => {
    expect(licensePeriod({ from: '2028-02-29', months: 12, today })).toEqual({ ok: true, value: { issued: '2028-02-29', expires: '2029-02-28' } });
  });

  it('refuses odd lengths and dates', () => {
    expect(licensePeriod({ months: 0, today }).ok).toBe(false);
    expect(licensePeriod({ months: 1.5, today }).ok).toBe(false);
    expect(licensePeriod({ from: '04/10/2026', months: 12, today }).ok).toBe(false);
  });
});

describe('publicKeyModule', () => {
  it('writes the key as a constant', () => {
    expect(publicKeyModule('-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n'))
      .toContain('export const LICENSE_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----\\n";');
  });
});
