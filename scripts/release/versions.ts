// The plugin version and release decisions. Pure: plan.ts and version.ts read the
// files and git tags. Claude Code and Cowork skip a version they already have, so a
// changed plugin needs a new version, in plugin.json and marketplace.json alike: Claude
// desktop learns of an update only from marketplace.json. Its plugin entry is pinned to the
// tag dist-v<version>, which the release workflow puts on the built dist commit. The version
// goes live on main minutes before that build, and a client that synced in between, pinned
// to the moving dist branch, kept the old plugin under the new version; pinned to a tag that
// doesn't exist yet, it gets nothing until the release is there.

import { ok, err, type Result } from '$shared/utils/result';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const isVersion = (value: unknown): value is string => typeof value === 'string' && SEMVER.test(value);

/** Negative when a is older than b. Both must be versions. */
export const compareVersions = (a: string, b: string): number => {
  const [, ...pa] = SEMVER.exec(a) ?? [];
  const [, ...pb] = SEMVER.exec(b) ?? [];
  for (let i = 0; i < 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
};

const VERSION_FIELD = /"version"\s*:\s*"([^"]*)"/g;

/** Every `"version"` in a JSON file's text. */
export const versionsIn = (text: string): readonly string[] => [...text.matchAll(VERSION_FIELD)].map((m) => m[1] ?? '');

/** The plugin's version: the one x.y.z in plugin.json. */
export const pluginVersion = (pluginJson: string): Result<string> => {
  const found = versionsIn(pluginJson);
  if (found.length !== 1 || !isVersion(found[0])) {
    return err(new Error(`plugin/.claude-plugin/plugin.json must have one x.y.z version (found ${found.join(', ') || 'none'}). Run \`bun run release:version <x.y.z>\`.`));
  }
  return ok(found[0]);
};

/** The tag on the built dist commit of a release, which marketplace.json pins the plugin to. */
export const distTag = (version: string): string => `dist-v${version}`;

const REF_FIELD = /"ref"\s*:\s*"([^"]*)"/g;

/** Every `"ref"` in a JSON file's text. */
export const refsIn = (text: string): readonly string[] => [...text.matchAll(REF_FIELD)].map((m) => m[1] ?? '');

/** marketplace.json names the plugin's version and pins its source to that version's dist tag. */
export const checkMarketplace = (marketplaceJson: string, version: string): Result<true> => {
  const versions = versionsIn(marketplaceJson);
  const refs = refsIn(marketplaceJson);
  if (versions.length === 0 || versions.some((v) => v !== version)) {
    return err(new Error(`.claude-plugin/marketplace.json must name version ${version}, as plugin.json does (found ${versions.join(', ') || 'none'}). Run \`bun run release:version <x.y.z>\`.`));
  }
  if (refs.length !== 1 || refs[0] !== distTag(version)) {
    return err(new Error(`.claude-plugin/marketplace.json must pin the plugin to "ref": "${distTag(version)}" (found ${refs.join(', ') || 'none'}). Run \`bun run release:version <x.y.z>\`.`));
  }
  return ok(true);
};

/** Replaces every `"ref"` value, keeping the file's formatting. */
export const withRef = (text: string, ref: string): string =>
  text.replace(REF_FIELD, (field, old: string) => field.replace(`"${old}"`, `"${ref}"`));

/** Replaces every `"version"` value, keeping the file's formatting. */
export const withVersion = (text: string, version: string): string =>
  text.replace(VERSION_FIELD, (field, old: string) => field.replace(`"${old}"`, `"${version}"`));

export interface ReleaseState {
  readonly version: string;
  /** Versions with a `v<version>` tag. */
  readonly released: readonly string[];
  /** Whether plugin/ differs from the newest release's tag. */
  readonly pluginChanged: boolean;
}

export type ReleasePlan =
  | { readonly kind: 'release'; readonly version: string }
  | { readonly kind: 'skip'; readonly reason: string };

export const planRelease = (s: ReleaseState): Result<ReleasePlan> => {
  const newest = [...s.released].filter(isVersion).sort(compareVersions).at(-1);
  if (s.released.includes(s.version)) {
    return s.pluginChanged && s.version === newest
      ? err(new Error(`plugin/ changed since v${s.version} was released, but the version is still ${s.version}. Clients skip a version they already have: run \`bun run release:version <next>\`.`))
      : ok({ kind: 'skip', reason: `v${s.version} is already released` });
  }
  if (newest && compareVersions(s.version, newest) <= 0) {
    return err(new Error(`Version ${s.version} isn't newer than the latest release, v${newest}.`));
  }
  return ok({ kind: 'release', version: s.version });
};
