#!/usr/bin/env bun
// Makes the keypair desktop app updates are signed with, once (like license:keygen):
//   - the private key goes to ~/.remry-updater/updater.key, outside the repo. Never commit it.
//   - the public key goes into desktop/src-tauri/tauri.conf.json (plugins.updater.pubkey),
//     which every build ships with, so an installed app accepts only updates signed with it.
// The key has no password and the script asks nothing: it lives only in this folder and in the
// TAURI_SIGNING_PRIVATE_KEY secret, which the release signs updates with.
// A new keypair means apps installed with the old public key never update again, so do it once.
//   bun run desktop:updater-key [--force]

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dir, '..');
const CONFIG = join(REPO, 'desktop', 'src-tauri', 'tauri.conf.json');
const KEY = join(homedir(), '.remry-updater', 'updater.key');

const config = JSON.parse(await readFile(CONFIG, 'utf8')) as { plugins?: { updater?: { pubkey?: string } } };
const force = process.argv.includes('--force');
if (config.plugins?.updater?.pubkey && !force) {
  console.error(`${CONFIG} already has an updater public key. A new one stops installed apps from updating; pass --force if you mean it.`);
  process.exit(1);
}
if (existsSync(KEY) && !force) {
  console.error(`${KEY} already exists. Pass --force to replace it.`);
  process.exit(1);
}

await mkdir(join(homedir(), '.remry-updater'), { recursive: true, mode: 0o700 });
// No password, and no prompt (--ci): a typed or stray password would have to be in a second
// secret too, and a wrong one fails every release at the signing step.
const generated = spawnSync('bunx', ['tauri', 'signer', 'generate', '--ci', '--password', '', '--write-keys', KEY, ...(force ? ['--force'] : [])], {
  cwd: join(REPO, 'desktop'),
  stdio: ['ignore', 'inherit', 'inherit']
});
if (generated.status !== 0) process.exit(generated.status ?? 1);

const pubkey = (await readFile(`${KEY}.pub`, 'utf8')).trim();
const next = { ...config, plugins: { ...config.plugins, updater: { ...config.plugins?.updater, pubkey } } };
await writeFile(CONFIG, `${JSON.stringify(next, null, 2)}\n`);
console.log(`\nWrote the public key to ${CONFIG}. Commit it.`);
// From the file, not a copy of the terminal: zsh marks output without a final newline with a %,
// which a copy picks up and the build then can't decode.
console.log('Set the private key as the GitHub secret straight from the file:');
console.log(`  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo remry-ai/remry < "${KEY}"`);
