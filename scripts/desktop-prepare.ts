#!/usr/bin/env bun
// Fills desktop/src-tauri from a release build, before `tauri build`:
//   binaries/remry-<rust target triple>[.exe]   the sidecar Tauri bundles
//   resources/migrations/, resources/VERSION      what the sidecar needs beside it
//   bun scripts/desktop-prepare.ts [dist/plugin]   (run bun run release:build first)

import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Tauri names a sidecar by Rust's target triple for the machine it builds on.
const TRIPLES: Readonly<Record<string, string>> = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'windows-x64': 'x86_64-pc-windows-msvc'
};

const REPO = resolve(import.meta.dir, '..');
const plugin = resolve(process.argv[2] ?? join(REPO, 'dist', 'plugin'));
const windows = process.platform === 'win32';
const target = `${windows ? 'windows' : process.platform}-${process.arch}`;
const triple = TRIPLES[target];
if (!triple) throw new Error(`No desktop build for ${target}`);

const exe = windows ? '.exe' : '';
const binary = join(plugin, 'server', `remry-${target}${exe}`);
if (!existsSync(binary)) {
  console.error(`No ${binary}. Run \`bun run release:build\` first.`);
  process.exit(1);
}

const tauri = join(REPO, 'desktop', 'src-tauri');
await rm(join(tauri, 'binaries'), { recursive: true, force: true });
await rm(join(tauri, 'resources'), { recursive: true, force: true });
await mkdir(join(tauri, 'binaries'), { recursive: true });
await mkdir(join(tauri, 'resources'), { recursive: true });
await cp(binary, join(tauri, 'binaries', `remry-${triple}${exe}`));
await cp(join(plugin, 'server', 'migrations'), join(tauri, 'resources', 'migrations'), { recursive: true });
await cp(join(plugin, 'server', 'VERSION'), join(tauri, 'resources', 'VERSION'));
console.log(`Prepared desktop/src-tauri for ${triple} from ${plugin}`);
