#!/usr/bin/env bun
// Packages built plugins (scripts/release/build.ts) for release:
//   1. merges the binaries of every given build into dist/plugin, so the plugin that
//      the `dist` branch publishes runs on every platform built
//   2. zips the plugin once per platform, with only that platform's binary, for
//      Claude desktop Chat uploads: dist/remry-<version>-<target>.zip
//   3. leaves off dist/plugin any binary too big for git (GitHub refuses files over
//      100 MB), so the `dist` branch push succeeds; its zip still has it
//   bun scripts/release/package.ts [<built plugin dir> ...]     (default: dist/plugin)

import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { binaryTarget, branchBinaries, mergePlan } from './package-plan';

const REPO = resolve(import.meta.dir, '..', '..');
const DIST = join(REPO, 'dist');
const PLUGIN = join(DIST, 'plugin');
const CHAT_UPLOAD_LIMIT = 50 * 1024 * 1024;
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const inputs = (process.argv.slice(2).length ? process.argv.slice(2) : [PLUGIN]).map((dir) => resolve(dir));

const builds = await Promise.all(inputs.map(async (dir) => ({
  dir,
  version: (await Bun.file(join(dir, 'server', 'VERSION')).text()).trim(),
  binaries: (await readdir(join(dir, 'server'))).filter((name) => binaryTarget(name) !== null)
})));
const plan = mergePlan(builds);
if (!plan.ok) {
  console.error(plan.error.message);
  process.exit(1);
}

// 1. One plugin with every binary. The first build is the base.
if (plan.value.base !== PLUGIN) {
  await rm(PLUGIN, { recursive: true, force: true });
  await cp(plan.value.base, PLUGIN, { recursive: true });
}
for (const copy of plan.value.copies) {
  if (copy.from !== join(PLUGIN, 'server', copy.name)) await cp(copy.from, join(PLUGIN, 'server', copy.name));
}

// 2. A zip per platform.
const binaries = (await readdir(join(PLUGIN, 'server'))).filter((name) => binaryTarget(name) !== null).sort();
for (const name of binaries) {
  const target = binaryTarget(name)!;
  const staging = await mkdtemp(join(tmpdir(), 'remry-package-'));
  await cp(PLUGIN, staging, { recursive: true, filter: (src) => !src.endsWith('.DS_Store') && !(binaryTarget(src.split(/[\\/]/).at(-1) ?? '') && !src.endsWith(name)) });
  const zip = join(DIST, `remry-${plan.value.version}-${target}.zip`);
  await rm(zip, { force: true });
  const zipped = spawnSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: staging, stdio: 'inherit' });
  await rm(staging, { recursive: true, force: true });
  if (zipped.status !== 0) {
    console.error('zip failed');
    process.exit(1);
  }
  const size = (await stat(zip)).size;
  console.log(`${zip} (${mb(size)})`);
  if (size > CHAT_UPLOAD_LIMIT) console.warn(`  over Claude desktop's ${mb(CHAT_UPLOAD_LIMIT)} upload limit`);
}
// 3. The dist branch is git: drop binaries GitHub would refuse.
const sized = await Promise.all(binaries.map(async (name) => ({ name, bytes: (await stat(join(PLUGIN, 'server', name))).size })));
const branch = branchBinaries(sized);
for (const name of branch.omit) {
  await rm(join(PLUGIN, 'server', name));
  console.warn(`Left ${name} off the dist branch: over GitHub's file size limit. Its zip has it.`);
}
console.log(`\n${PLUGIN} carries ${branch.keep.join(', ') || 'no binaries'}`);
