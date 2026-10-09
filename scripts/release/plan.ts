#!/usr/bin/env bun
// Decides whether this commit is a plugin release (used by .github/workflows/release.yml).
// Prints `version=` and `release=` lines, and appends them to $GITHUB_OUTPUT in Actions.
// Fails when plugin/ changed since the last release without a version bump.
//   bun scripts/release/plan.ts

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { agreedVersion, compareVersions, isVersion, planRelease } from './versions';

const git = (...args: string[]): { readonly status: number | null; readonly stdout: string } => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '' };
};

const version = agreedVersion(
  await Bun.file('plugin/.claude-plugin/plugin.json').text(),
  await Bun.file('.claude-plugin/marketplace.json').text()
);
if (!version.ok) {
  console.error(version.error.message);
  process.exit(1);
}

const released = git('tag', '--list', 'v*').stdout.split('\n').map((t) => t.trim().slice(1)).filter(isVersion);
const newest = [...released].sort(compareVersions).at(-1);
// `git diff --quiet` exits 1 when there are differences.
const pluginChanged = newest ? git('diff', '--quiet', `v${newest}`, 'HEAD', '--', 'plugin').status === 1 : false;

const plan = planRelease({ version: version.value, released, pluginChanged });
if (!plan.ok) {
  console.error(plan.error.message);
  process.exit(1);
}

const lines = [`version=${version.value}`, `release=${plan.value.kind === 'release'}`];
console.log(plan.value.kind === 'release' ? `Releasing v${version.value}` : `Not releasing: ${plan.value.reason}`);
console.log(lines.join('\n'));
if (process.env['GITHUB_OUTPUT']) appendFileSync(process.env['GITHUB_OUTPUT'], `${lines.join('\n')}\n`);
