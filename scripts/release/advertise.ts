#!/usr/bin/env bun
// Points .claude-plugin/marketplace.json at a release: its version, and its dist tag. That's
// how Claude desktop learns of an update, so only the release workflow runs this, once the
// release is built and tagged (see versions.ts).
//   bun scripts/release/advertise.ts <x.y.z>

import { distTag, isVersion, refsIn, versionsIn, withRef, withVersion } from './versions';

const MARKETPLACE = '.claude-plugin/marketplace.json';

const version = process.argv[2];
if (!isVersion(version)) {
  console.error('Usage: bun scripts/release/advertise.ts <x.y.z>');
  process.exit(1);
}

const text = await Bun.file(MARKETPLACE).text();
if (versionsIn(text).length === 0 || refsIn(text).length !== 1) {
  console.error(`${MARKETPLACE} needs its "version" fields and one "ref" to set.`);
  process.exit(1);
}
await Bun.write(MARKETPLACE, withRef(withVersion(text, version), distTag(version)));
console.log(`${MARKETPLACE} names ${version}.`);
