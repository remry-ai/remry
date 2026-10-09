// The license key on this computer: `licenseKey` in <data dir>/settings.json, beside the
// default notebook, so it covers every notebook, the app, the CLI and the MCP server.
// Read on each check, so a key added in one process counts in the others straight away.

import { settings } from '../settings/server/index.server';
import { readRootSettings, updateRootSettings } from '../settings/server/root-settings.server';
import { NO_LICENSE, type LicenseStatus } from '../types/license';
import { ok, err, type Result } from '../utils/result';
import { verifyLicenseKey } from './verify.server';

const readKey = async (): Promise<string | null> => {
  const key = (await readRootSettings(settings))['licenseKey'];
  if (key === undefined) return null;
  // Anything else stored there reads as an invalid key, not as no license.
  return typeof key === 'string' ? key : '';
};

/** The license on this computer, checked now. */
export const currentLicense = async (now: Date = new Date(), publicKey: string = settings.licensePublicKey): Promise<LicenseStatus> => {
  const key = await readKey();
  if (key === null) return NO_LICENSE;
  return verifyLicenseKey(key, publicKey, now);
};

/** Saves a key after checking it. Refuses an invalid or expired one, and leaves the current one in place. */
export const activateLicense = async (key: string, now: Date = new Date(), publicKey: string = settings.licensePublicKey): Promise<Result<LicenseStatus>> => {
  const status = verifyLicenseKey(key, publicKey, now);
  if (status.state === 'invalid') return err(new Error(`That license key isn't valid: ${status.problem}.`));
  if (status.state === 'expired') return err(new Error(`That license key expired on ${status.expires}. Use the renewed key.`));
  await updateRootSettings(settings, { licenseKey: key.trim() });
  return ok(status);
};

export const removeLicense = async (): Promise<Result<LicenseStatus>> => {
  await updateRootSettings(settings, { licenseKey: undefined });
  return ok(NO_LICENSE);
};
