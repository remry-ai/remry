#!/usr/bin/env bun
// Revokes a Remry Pro license, after a refund or chargeback:
//   bun run license:revoke --key <the customer's latest key> [--reason refund]
//   bun run license:revoke --id <license id> --expires <its latest expiry> [--reason refund]
//   bun run license:revoke --prune             only drop entries whose keys have expired
// Rewrites src/shared/license/revoked.ts. Commit it and release: the key stops unlocking
// Pro once the app updates. Every run also drops entries past their expiry, since those
// keys no longer work anyway, so the list stays short.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LICENSE_PUBLIC_KEY } from '../../src/shared/license/public-key';
import { REVOKED_LICENSES, type RevokedLicense } from '../../src/shared/license/revoked';
import { readLicensePayload } from '../../src/shared/license/verify.server';
import { planRevocation, renderRevokedFile } from './revoke-list';

const option = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const today = new Date().toISOString().slice(0, 10);
const note = `${today} ${option('reason') ?? 'revoked'}`;

let revoke: RevokedLicense | null = null;
const key = option('key');
if (key) {
  const payload = readLicensePayload(key, LICENSE_PUBLIC_KEY);
  if (!payload) fail("That key's signature doesn't match this app's public key; check you copied the whole key.");
  else revoke = { id: payload.id, expires: payload.expires, note };
} else if (option('id')) {
  const expires = option('expires');
  if (!expires) fail('With --id, pass --expires: the latest expiry issued for that license (license:issue printed it).');
  revoke = { id: option('id')!, expires: expires!, note };
} else if (!process.argv.includes('--prune')) {
  fail('Usage: bun run license:revoke --key <key> [--reason refund] | --id <id> --expires <YYYY-MM-DD> | --prune');
}

const plan = planRevocation(REVOKED_LICENSES, revoke, today);
if (!plan.ok) fail(plan.error.message);
else {
  const file = resolve(import.meta.dir, '..', '..', 'src', 'shared', 'license', 'revoked.ts');
  await writeFile(file, renderRevokedFile(plan.value.entries));
  if (revoke) console.log(`Revoked ${revoke.id} through ${revoke.expires}.`);
  if (plan.value.pruned.length) console.log(`Dropped ${plan.value.pruned.length} entr${plan.value.pruned.length === 1 ? 'y' : 'ies'} whose keys have expired: ${plan.value.pruned.map((e) => e.id).join(', ')}.`);
  console.log(`${plan.value.entries.length} revoked in ${file}. Commit it and release; revoked keys stop working once the app updates.`);
}
