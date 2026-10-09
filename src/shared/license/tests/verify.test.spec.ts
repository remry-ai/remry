import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { daysLeft, signLicenseKey, verifyLicenseKey } from '../verify.server';
import { lockedMessage, type LicensePayload } from '../../types/license';

const pair = () => generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});
const keys = pair();
const payload: LicensePayload = { v: 1, id: 'l1', name: 'Dana Park', email: 'dana@example.com', plan: 'pro', issued: '2026-10-04', expires: '2027-10-03' };
const now = new Date('2026-10-04T12:00:00Z');

describe('verifyLicenseKey', () => {
  it('accepts a key signed with the matching private key', () => {
    const status = verifyLicenseKey(signLicenseKey(payload, keys.privateKey), keys.publicKey, now);
    expect(status).toEqual({ state: 'active', licensee: { name: 'Dana Park', email: 'dana@example.com' }, expires: '2027-10-03', daysLeft: 365, problem: null });
  });

  it('is good through the expiry day, and expired the day after', () => {
    const key = signLicenseKey(payload, keys.privateKey);
    expect(verifyLicenseKey(key, keys.publicKey, new Date('2027-10-03T23:59:00Z'))).toMatchObject({ state: 'active', daysLeft: 1 });
    expect(verifyLicenseKey(key, keys.publicKey, new Date('2027-10-04T00:00:00Z'))).toMatchObject({ state: 'expired', daysLeft: 0 });
  });

  it('refuses a key signed with another private key', () => {
    const status = verifyLicenseKey(signLicenseKey(payload, pair().privateKey), keys.publicKey, now);
    expect(status).toMatchObject({ state: 'invalid', licensee: null });
    expect(status.problem).toContain('signature');
  });

  it('refuses a key whose contents were changed', () => {
    const [prefix, , signature] = signLicenseKey(payload, keys.privateKey).split('.');
    const longer = Buffer.from(JSON.stringify({ ...payload, expires: '2099-01-01' })).toString('base64url');
    expect(verifyLicenseKey(`${prefix}.${longer}.${signature}`, keys.publicKey, now).state).toBe('invalid');
  });

  it('refuses things that aren\'t keys, and signed payloads that aren\'t licenses', () => {
    expect(verifyLicenseKey('hello', keys.publicKey, now).problem).toContain("isn't a Remry license key");
    const odd = signLicenseKey({ ...payload, plan: 'free' } as unknown as LicensePayload, keys.privateKey);
    expect(verifyLicenseKey(odd, keys.publicKey, now).state).toBe('invalid');
  });

  it('refuses a revoked license, renewals included, whatever its dates', () => {
    const key = signLicenseKey(payload, keys.privateKey);
    const status = verifyLicenseKey(key, keys.publicKey, now, new Set(['l1']));
    expect(status).toMatchObject({ state: 'invalid', licensee: null, problem: 'this license was refunded or revoked' });
    const renewal = signLicenseKey({ ...payload, issued: '2027-10-04', expires: '2028-10-03' }, keys.privateKey);
    expect(verifyLicenseKey(renewal, keys.publicKey, now, new Set(['l1'])).state).toBe('invalid');
    expect(verifyLicenseKey(key, keys.publicKey, now, new Set(['other'])).state).toBe('active');
  });

  it('ignores surrounding whitespace from a paste', () => {
    expect(verifyLicenseKey(`  ${signLicenseKey(payload, keys.privateKey)}\n`, keys.publicKey, now).state).toBe('active');
  });
});

describe('daysLeft', () => {
  it('counts today', () => {
    expect(daysLeft('2026-10-04', now)).toBe(1);
    expect(daysLeft('2026-10-03', now)).toBe(0);
  });
});

describe('lockedMessage', () => {
  it('says what to do, for each state', () => {
    expect(lockedMessage('search', { state: 'none', licensee: null, expires: null, daysLeft: null, problem: null }))
      .toBe('Full-text search is part of Remry Pro. Add a license key in the app (License) or with license.activate.');
    expect(lockedMessage('pdf-export', { state: 'expired', licensee: { name: 'Dana', email: 'd@x' }, expires: '2027-10-03', daysLeft: -2, problem: null }))
      .toContain('expired on 2027-10-03. Renew it');
    expect(lockedMessage('branding', { state: 'none', licensee: null, expires: null, daysLeft: null, problem: null }, 'app'))
      .toBe('Branding is part of Remry Pro. Add a license key on the License page.');
  });
});
