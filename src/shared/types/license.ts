// Remry Pro: what a license unlocks, and the status the app, CLI and MCP see.
// Client-safe; verifying a key is server-only (src/shared/license/verify.server.ts).

import { REMRY_LINKS } from './site';

export const PRO_FEATURES = ['branding', 'pdf-export', 'search'] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

export const PRO_FEATURE_LABELS: Readonly<Record<ProFeature, string>> = {
  branding: 'Branding',
  'pdf-export': 'PDF export',
  search: 'Full-text search'
};

/** What a license key carries, signed. Dates are YYYY-MM-DD (UTC); a license is good through `expires`. */
export interface LicensePayload {
  readonly v: 1;
  /** A license id, so a renewal can say which license it continues. */
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly plan: 'pro';
  readonly issued: string;
  readonly expires: string;
}

export type LicenseState = 'none' | 'active' | 'expired' | 'invalid';

export interface LicenseStatus {
  readonly state: LicenseState;
  /** Present for an active or expired license. */
  readonly licensee: { readonly name: string; readonly email: string } | null;
  readonly expires: string | null;
  /** Whole days left, counting today; 0 or less once expired. Null without a license. */
  readonly daysLeft: number | null;
  /** Why a key was refused, for an invalid one. */
  readonly problem: string | null;
}

/** Days before expiry at which the app starts mentioning renewal. */
export const RENEWAL_NOTICE_DAYS = 30;

export const NO_LICENSE: LicenseStatus = { state: 'none', licensee: null, expires: null, daysLeft: null, problem: null };

export const isProActive = (status: LicenseStatus): boolean => status.state === 'active';

/**
 * Why a Pro feature is locked, written for whoever hit it: Claude or the CLI through a
 * procedure (`tool`, the default), or the user in the app (`app`). The tool message carries the
 * buy and help links, for Claude to pass on; in the app, the License page has them.
 */
export const lockedMessage = (feature: ProFeature, status: LicenseStatus, audience: 'tool' | 'app' = 'tool'): string => {
  const what = `${PRO_FEATURE_LABELS[feature]} is part of Remry Pro`;
  const where = audience === 'app' ? 'on the License page' : 'in the app (License) or with license.activate';
  const at = (url: string): string => (audience === 'app' ? '' : ` (${url})`);
  switch (status.state) {
    case 'expired':
      return `${what}, and the license for ${status.licensee?.name ?? 'this computer'} expired on ${status.expires}. A renewed subscription emails a new key: add it ${where}. Otherwise renew${at(REMRY_LINKS.buy)}.`;
    case 'invalid':
      return `${what}, and the license key on this computer isn't valid (${status.problem ?? 'unreadable'}). Add a valid key ${where}${audience === 'app' ? '' : `; help with keys: ${REMRY_LINKS.help}`}.`;
    default:
      return `${what}. Buy a license${at(REMRY_LINKS.buy)}, then add its key ${where}.`;
  }
};
