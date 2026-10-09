// License ids that no longer unlock Remry Pro: refunded or charged back.
// Each release carries this list, so a revoked key stops working once the app
// updates; nothing is ever looked up online. Ids are random UUIDs, never names or
// emails, so the list is safe in a public repo.
//
// Each entry carries the license's expiry: after it, the key has expired anyway, so
// `bun run license:revoke` drops the entry and the list doesn't grow for ever. A
// renewal keeps its license's id, so use the latest key's expiry (license:revoke
// --key reads it from the key). Edit with scripts/license/revoke.ts, not by hand.

export interface RevokedLicense {
  readonly id: string;
  /** The revoked license's last valid day (YYYY-MM-DD); the entry can go after it. */
  readonly expires: string;
  /** When and why, for the seller: never a name or an email. */
  readonly note: string;
}

export const REVOKED_LICENSES: readonly RevokedLicense[] = [];

export const REVOKED_LICENSE_IDS: ReadonlySet<string> = new Set(REVOKED_LICENSES.map((license) => license.id));
