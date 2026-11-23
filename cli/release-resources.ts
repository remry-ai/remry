// Where a release binary's VERSION and migrations are: beside it (App/<version>/, dist/app/,
// the Windows install folder) or in Contents/Resources of the macOS app it's linked from.
// The binary may be started through App/current, a link, so the lookup starts from its real path.

import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { resourceDirsFor } from './desktop-plan';

/** This process's binary, links resolved. */
export const realBinaryPath = (binary: string = process.execPath): string => {
  try {
    return realpathSync(binary);
  } catch {
    return binary;
  }
};

/** The first of a release's resource folders that holds `name`, or null when none does. */
export const findReleaseFile = (name: string, binary: string = process.execPath): string | null => {
  for (const dir of resourceDirsFor(path.dirname(realBinaryPath(binary)), path)) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};
