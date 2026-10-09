#!/usr/bin/env bun
// Makes the signing keypair for Remry Pro licenses. Run once, by the seller:
//   bun run license:keygen [--out <private key path>]
// The private key goes outside the repo (default ~/.remry-license/private.pem,
// readable only by you) and must never be committed: anyone with it can issue keys.
// The public key replaces src/shared/license/public-key.ts, so commit that file and
// release; keys issued with an older private key stop working in the new release.

import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { defaultPrivateKeyPath, publicKeyModule } from './key-file';

const option = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const out = resolve(option('out') ?? defaultPrivateKeyPath(homedir(), existsSync));
if (existsSync(out)) {
  console.error(`${out} already exists. Keep it: it signs every license you've issued. To start over, move it away first.`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

await mkdir(dirname(out), { recursive: true, mode: 0o700 });
await writeFile(out, privateKey, { mode: 0o600 });
await chmod(out, 0o600);
const moduleFile = resolve(import.meta.dir, '..', '..', 'src', 'shared', 'license', 'public-key.ts');
await writeFile(moduleFile, publicKeyModule(publicKey));
console.log(`Private key: ${out} (back it up somewhere safe, and never commit it)\nPublic key:  ${moduleFile} (commit this)`);
