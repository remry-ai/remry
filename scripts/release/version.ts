#!/usr/bin/env bun
// Sets the plugin version in plugin/.claude-plugin/plugin.json, and keeps package.json's
// version in step so no file names an older version. marketplace.json names none (see
// versions.ts). Pushing that to main releases it.
//   bun run release:version <x.y.z>

import { compareVersions, isVersion, pluginVersion, withVersion } from './versions';

const PLUGIN = 'plugin/.claude-plugin/plugin.json';
const PACKAGE = 'package.json';

const next = process.argv[2];
if (!isVersion(next)) {
  console.error('Usage: bun run release:version <x.y.z>');
  process.exit(1);
}

const plugin = await Bun.file(PLUGIN).text();
const current = pluginVersion(plugin);
if (current.ok && compareVersions(next, current.value) <= 0) {
  console.error(`${next} isn't newer than the current version, ${current.value}.`);
  process.exit(1);
}

await Bun.write(PLUGIN, withVersion(plugin, next));
await Bun.write(PACKAGE, withVersion(await Bun.file(PACKAGE).text(), next));
console.log(`Set the plugin version to ${next}${current.ok ? ` (was ${current.value})` : ''}. Commit and push to main to release it.`);
