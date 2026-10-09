// Pure: the revocation list's entries, and the source of src/shared/license/revoked.ts.

import { ok, err, type Result } from '../../src/shared/utils/result';
import type { RevokedLicense } from '../../src/shared/license/revoked';

const ID = /^[A-Za-z0-9-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface RevocationPlan {
  readonly entries: readonly RevokedLicense[];
  /** Entries dropped because their keys have expired anyway. */
  readonly pruned: readonly RevokedLicense[];
}

/**
 * The list with `revoke` added (or, for an id already listed, its expiry moved later), and
 * every entry whose expiry is before `today` dropped: a key past its expiry no longer
 * unlocks anything, so its entry is dead weight. `revoke` may be null to only prune.
 */
export const planRevocation = (
  entries: readonly RevokedLicense[],
  revoke: RevokedLicense | null,
  today: string
): Result<RevocationPlan> => {
  if (revoke) {
    if (!ID.test(revoke.id)) return err(new Error(`"${revoke.id}" isn't a license id (letters, digits and dashes, as printed by license:issue)`));
    if (!DATE.test(revoke.expires)) return err(new Error(`"${revoke.expires}" isn't a date like 2027-10-03`));
  }
  const listed = entries.find((e) => e.id === revoke?.id);
  if (revoke && listed && listed.expires >= revoke.expires) return err(new Error(`License ${revoke.id} is already revoked, through ${listed.expires}`));
  const merged = revoke ? [...entries.filter((e) => e.id !== revoke.id), revoke] : [...entries];
  const pruned = merged.filter((e) => e.expires < today);
  return ok({ entries: merged.filter((e) => e.expires >= today).sort((a, b) => a.expires.localeCompare(b.expires)), pruned });
};

const HEADER = `// License ids that no longer unlock Remry Pro: refunded or charged back.
// Each release carries this list, so a revoked key stops working once the app
// updates; nothing is ever looked up online. Ids are random UUIDs, never names or
// emails, so the list is safe in a public repo.
//
// Each entry carries the license's expiry: after it, the key has expired anyway, so
// \`bun run license:revoke\` drops the entry and the list doesn't grow for ever. A
// renewal keeps its license's id, so use the latest key's expiry (license:revoke
// --key reads it from the key). Edit with scripts/license/revoke.ts, not by hand.

export interface RevokedLicense {
  readonly id: string;
  /** The revoked license's last valid day (YYYY-MM-DD); the entry can go after it. */
  readonly expires: string;
  /** When and why, for the seller: never a name or an email. */
  readonly note: string;
}
`;

const FOOTER = `
export const REVOKED_LICENSE_IDS: ReadonlySet<string> = new Set(REVOKED_LICENSES.map((license) => license.id));
`;

export const renderRevokedFile = (entries: readonly RevokedLicense[]): string => {
  const rows = entries.map((e) => `  { id: ${JSON.stringify(e.id)}, expires: ${JSON.stringify(e.expires)}, note: ${JSON.stringify(e.note.replace(/[\r\n]+/g, ' ').trim())} },`);
  return `${HEADER}\nexport const REVOKED_LICENSES: readonly RevokedLicense[] = [${rows.length ? `\n${rows.join('\n')}\n` : ''}];\n${FOOTER}`;
};
