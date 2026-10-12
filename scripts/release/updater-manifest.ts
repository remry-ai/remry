#!/usr/bin/env bun
// Writes latest.json, the manifest the desktop app's updater reads from the latest GitHub
// release (tauri-plugin-updater; desktop/src-tauri/tauri.conf.json). One entry per platform
// that built a signed update: the asset's download URL and its signature.
//   bun scripts/release/updater-manifest.ts <version> <assets dir>
// It names the assets the release workflow copied into <assets dir>, and writes
// <assets dir>/latest.json. With no signed update in it, it writes nothing.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The updater's platform key for each update asset the workflow names. */
export const UPDATE_ASSETS: ReadonlyMap<string, (version: string) => string> = new Map([
  ['darwin-aarch64', (version: string) => `Remry-${version}-macos-arm64.app.tar.gz`],
  ['windows-x86_64', (version: string) => `Remry-${version}-windows-x64-setup.exe`]
]);

export interface UpdaterManifest {
  readonly version: string;
  readonly pub_date: string;
  readonly notes: string;
  readonly platforms: Readonly<Record<string, { readonly signature: string; readonly url: string }>>;
}

/**
 * Pure. The manifest for the assets that have a signature beside them (`<asset>.sig`).
 * Null when none has one: the release then carries no update, and installed apps keep
 * the version they have.
 */
export const updaterManifest = (o: {
  readonly version: string;
  readonly repo: string;
  readonly pubDate: string;
  readonly signatures: ReadonlyMap<string, string>;
}): UpdaterManifest | null => {
  const platforms = Object.fromEntries(
    [...UPDATE_ASSETS].flatMap(([platform, name]) => {
      const asset = name(o.version);
      const signature = o.signatures.get(asset);
      return signature
        ? [[platform, { signature: signature.trim(), url: `https://github.com/${o.repo}/releases/download/v${o.version}/${asset}` }]]
        : [];
    })
  );
  if (Object.keys(platforms).length === 0) return null;
  return { version: o.version, pub_date: o.pubDate, notes: `Remry ${o.version}`, platforms };
};

if (import.meta.main) {
  const [version, dir] = process.argv.slice(2);
  if (!version || !dir) {
    console.error('Usage: bun scripts/release/updater-manifest.ts <version> <assets dir>');
    process.exit(1);
  }
  const files = await readdir(dir);
  const signatures = new Map(
    await Promise.all(files.filter((f) => f.endsWith('.sig')).map(async (f) => [f.slice(0, -'.sig'.length), await readFile(join(dir, f), 'utf8')] as const))
  );
  const manifest = updaterManifest({ version, repo: process.env['GITHUB_REPOSITORY'] ?? 'remry-ai/remry', pubDate: new Date().toISOString(), signatures });
  if (!manifest) {
    console.log('No signed updates, so no latest.json: installed apps keep their version.');
  } else {
    await writeFile(join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote latest.json for ${Object.keys(manifest.platforms).join(', ')}`);
  }
}
