// Offline license keys: a signed payload, checked against the public key built into
// the app. Nothing is sent anywhere; issuing a key needs the private key, which never
// enters this repo (scripts/license/).
//
// Key format: WN1.<base64url payload JSON>.<base64url Ed25519 signature of the payload part>

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { NO_LICENSE, type LicensePayload, type LicenseStatus } from '../types/license';
import { REVOKED_LICENSE_IDS } from './revoked';

const PREFIX = 'WN1';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const isPayload = (value: unknown): value is LicensePayload => {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return p['v'] === 1 && p['plan'] === 'pro'
    && typeof p['id'] === 'string' && typeof p['name'] === 'string' && typeof p['email'] === 'string'
    && typeof p['issued'] === 'string' && DATE.test(p['issued'])
    && typeof p['expires'] === 'string' && DATE.test(p['expires']);
};

const invalid = (problem: string): LicenseStatus => ({ ...NO_LICENSE, state: 'invalid', problem });

/** Whole days from `now` (UTC day) through `expires`, counting today: 1 on the last day, 0 the day after. */
export const daysLeft = (expires: string, now: Date): number => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.parse(`${expires}T00:00:00Z`) - today) / DAY_MS) + 1;
};

/** A key's payload, only if its signature checks out against the public key. */
export const readLicensePayload = (key: string, publicKeyPem: string): LicensePayload | null => {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, body, signature] = parts as [string, string, string];
  try {
    if (!verify(null, Buffer.from(body), createPublicKey(publicKeyPem), Buffer.from(signature, 'base64url'))) return null;
    const payload: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return isPayload(payload) ? payload : null;
  } catch {
    return null;
  }
};

/**
 * Checks a key's signature, its dates, and that its id hasn't been revoked.
 * Deterministic for a given key, public key, time and revocation list.
 */
export const verifyLicenseKey = (
  key: string,
  publicKeyPem: string,
  now: Date,
  revoked: ReadonlySet<string> = REVOKED_LICENSE_IDS
): LicenseStatus => {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return invalid("it isn't a Remry license key");
  const [, body, signature] = parts as [string, string, string];

  let signed = false;
  try {
    signed = verify(null, Buffer.from(body), createPublicKey(publicKeyPem), Buffer.from(signature, 'base64url'));
  } catch {
    signed = false;
  }
  if (!signed) return invalid("its signature doesn't match: it was changed, or wasn't issued for this app");

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return invalid("its contents can't be read");
  }
  if (!isPayload(payload)) return invalid("its contents aren't a Remry Pro license");
  if (revoked.has(payload.id)) return invalid('this license was refunded or revoked');

  const left = daysLeft(payload.expires, now);
  return {
    state: left > 0 ? 'active' : 'expired',
    licensee: { name: payload.name, email: payload.email },
    expires: payload.expires,
    daysLeft: left,
    problem: null
  };
};

/** Signs a payload into a key. Only scripts/license/issue.ts and tests have a private key to call it with. */
export const signLicenseKey = (payload: LicensePayload, privateKeyPem: string): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(body), createPrivateKey(privateKeyPem)).toString('base64url');
  return `${PREFIX}.${body}.${signature}`;
};
