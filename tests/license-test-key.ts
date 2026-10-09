// The private half of the test-only signing key (src/shared/license/test-key.ts), to issue
// license keys in tests. Trusted only under APP_ENV=test, never by the app or a release.

import { signLicenseKey } from '../src/shared/license/verify.server';

export const TEST_LICENSE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIK6QaK+QhWdbHYWkSZDDn/N/tg9I9hpjv3BPfQ0R3iCx\n-----END PRIVATE KEY-----\n";

/** A Pro license key the test settings accept: active for a year from today unless `expires` says otherwise. */
export const testLicenseKey = (expires?: string): string => {
  const today = new Date();
  const nextYear = new Date(Date.UTC(today.getUTCFullYear() + 1, today.getUTCMonth(), today.getUTCDate()));
  return signLicenseKey({
    v: 1,
    id: 'test-license',
    name: 'Test Buyer',
    email: 'buyer@example.com',
    plan: 'pro',
    issued: today.toISOString().slice(0, 10),
    expires: expires ?? nextYear.toISOString().slice(0, 10)
  }, TEST_LICENSE_PRIVATE_KEY);
};
