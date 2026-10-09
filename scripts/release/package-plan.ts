// Pure planning for scripts/release/package.ts.

import { join } from 'node:path';
import { ok, err, type Result } from '$shared/utils/result';

/** The target of a release binary's file name (`remry-linux-x64`, `remry-windows-x64.exe`), or null. */
export const binaryTarget = (name: string): string | null => name.match(/^remry-([a-z]+-[a-z0-9]+)(\.exe)?$/)?.[1] ?? null;

export interface BuiltPlugin {
  readonly dir: string;
  readonly version: string;
  readonly binaries: readonly string[];
}

export interface MergePlan {
  readonly version: string;
  readonly base: string;
  readonly copies: readonly { readonly from: string; readonly name: string }[];
}

/** Every build must be the same version, and each platform may come from only one of them. */
export const mergePlan = (builds: readonly BuiltPlugin[]): Result<MergePlan> => {
  const [first] = builds;
  if (!first) return err(new Error('No built plugin to package'));
  const mismatched = builds.find((b) => b.version !== first.version);
  if (mismatched) return err(new Error(`${mismatched.dir} is version ${mismatched.version}, but ${first.dir} is ${first.version}`));
  const seen = new Map<string, string>();
  const copies: { from: string; name: string }[] = [];
  for (const build of builds) {
    for (const name of build.binaries) {
      const target = binaryTarget(name);
      if (!target) continue;
      const other = seen.get(target);
      if (other) return err(new Error(`Two builds for ${target}: ${other} and ${build.dir}`));
      seen.set(target, build.dir);
      copies.push({ from: join(build.dir, 'server', name), name });
    }
  }
  if (copies.length === 0) return err(new Error('The built plugins have no remry binaries'));
  return ok({ version: first.version, base: first.dir, copies });
};

/** GitHub refuses a file over 100 MB in git; the dist branch keeps a margin under that. */
export const BRANCH_FILE_LIMIT_BYTES = 95 * 1024 * 1024;

/**
 * Which binaries the `dist` branch can carry. A binary over the limit is left off the
 * branch, so the marketplace plugin has no build for that platform; its release zip
 * still carries it, for a Claude desktop upload or the desktop app.
 */
export const branchBinaries = (
  binaries: readonly { readonly name: string; readonly bytes: number }[],
  limit = BRANCH_FILE_LIMIT_BYTES
): { readonly keep: readonly string[]; readonly omit: readonly string[] } => ({
  keep: binaries.filter((b) => b.bytes <= limit).map((b) => b.name),
  omit: binaries.filter((b) => b.bytes > limit).map((b) => b.name)
});
