// Remry Pro: the license file, and the procedures it gates, through the real router.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { activateLicense, currentLicense } from '../../src/shared/license/store.server';
import { testLicenseKey } from '../license-test-key';
import { TEST_NOTEBOOK } from './test-notebooks';

const settingsFile = resolve('data/test/settings.json');
const settingsJson = (): Record<string, unknown> => JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;
/** Stores a key the way the app does, keeping the default notebook. */
const storeKey = (key: string): void => writeFileSync(settingsFile, JSON.stringify({ ...settingsJson(), licenseKey: key }));

const caller = async () => {
  const notebook = await resolveCurrentNotebook({ explicit: TEST_NOTEBOOK });
  if (!notebook.ok) throw notebook.error;
  return createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
};

describe('license', () => {
  it('starts with none, and Pro procedures say how to unlock them', async () => {
    const api = await caller();
    expect(await api.license.status()).toMatchObject({ ok: true, value: { state: 'none' } });

    const search = await api.search.query({ q: 'alice' });
    expect(!search.ok && search.error.message).toBe('Full-text search is part of Remry Pro. Add a license key in the app (License) or with license.activate.');
    const branding = await api.branding.create({ name: 'Acme' });
    expect(!branding.ok && branding.error.message).toContain('Branding is part of Remry Pro');

    // Reading stays free, so stored brandings still list without a license.
    expect((await api.branding.list()).ok).toBe(true);
  });

  it('refuses invalid and expired keys, and keeps the file unwritten', async () => {
    const api = await caller();
    const garbage = await api.license.activate({ key: 'WN1.not.valid' });
    expect(!garbage.ok && garbage.error.message).toContain("isn't valid");
    const expired = await api.license.activate({ key: testLicenseKey('2020-01-01') });
    expect(!expired.ok && expired.error.message).toContain('expired on 2020-01-01');
    expect(settingsJson()['licenseKey']).toBeUndefined();
  });

  it('unlocks Pro with a valid key, for every notebook and process', async () => {
    const api = await caller();
    const activated = await api.license.activate({ key: testLicenseKey() });
    expect(activated).toMatchObject({ ok: true, value: { state: 'active', licensee: { name: 'Test Buyer' } } });
    // Beside the default notebook in settings.json, which it keeps.
    expect(settingsJson()).toMatchObject({ defaultNotebook: TEST_NOTEBOOK, licenseKey: expect.stringMatching(/^WN1\./) });

    expect((await api.search.query({ q: 'alice' })).ok).toBe(true);
    const created = await api.branding.create({ name: 'Acme' });
    expect(created.ok).toBe(true);
    if (created.ok) expect((await api.branding.update({ id: created.value.id, primaryColor: '#112233' })).ok).toBe(true);
  });

  it('locks again when the stored key has expired, and unlocks with the renewal', async () => {
    storeKey(testLicenseKey('2021-06-30'));
    const api = await caller();
    expect(await currentLicense()).toMatchObject({ state: 'expired', expires: '2021-06-30' });
    const search = await api.search.query({ q: 'alice' });
    expect(!search.ok && search.error.message).toContain('expired on 2021-06-30');

    expect((await activateLicense(testLicenseKey())).ok).toBe(true);
    expect((await api.search.query({ q: 'alice' })).ok).toBe(true);
  });

  it('says a tampered stored key is invalid', async () => {
    storeKey('WN1.abc.def');
    expect(await currentLicense()).toMatchObject({ state: 'invalid' });
  });

  it('removes the license', async () => {
    const api = await caller();
    expect(await api.license.remove()).toMatchObject({ ok: true, value: { state: 'none' } });
    expect(settingsJson()).toEqual({ defaultNotebook: TEST_NOTEBOOK });
  });
});
