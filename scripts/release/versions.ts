// The plugin version and release decisions. Pure: plan.ts and version.ts read the
// files and git tags. Claude Code and Cowork skip a version they already have, so a
// changed plugin needs a new version, in plugin.json and marketplace.json alike.

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

/** The one version plugin.json and marketplace.json agree on. */
export const agreedVersion = (pluginJson: string, marketplaceJson: string): Result<string> => {
  const all = [...versionsIn(pluginJson), ...versionsIn(marketplaceJson)];
  const distinct = [...new Set(all)];
  if (distinct.length !== 1 || !isVersion(distinct[0])) {
    return err(new Error(`plugin/.claude-plugin/plugin.json and .claude-plugin/marketplace.json must share one x.y.z version (found ${distinct.join(', ') || 'none'}). Run \`bun run release:version <x.y.z>\`.`));
  }
  return ok(distinct[0]);
};

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
