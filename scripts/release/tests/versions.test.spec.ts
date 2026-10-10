import { describe, it, expect } from 'vitest';
import { checkMarketplace, compareVersions, distTag, planRelease, pluginVersion, refsIn, versionsIn, withRef, withVersion } from '../versions';

const plugin = '{\n  "name": "remry",\n  "version": "0.5.0",\n  "keywords": ["notes"]\n}\n';
const marketplace = '{\n  "metadata": { "version": "0.5.0" },\n  "plugins": [{ "name": "remry", "source": { "source": "github", "ref": "dist-v0.5.0" }, "version": "0.5.0" }]\n}\n';

describe('versions', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('0.4.0', '0.5.0')).toBeLessThan(0);
  });

  it('reads the one version in plugin.json, or explains what is wrong', () => {
    expect(pluginVersion(plugin)).toEqual({ ok: true, value: '0.5.0' });
    const none = pluginVersion('{"name": "remry"}');
    expect(!none.ok && none.error.message).toContain('found none');
    expect(pluginVersion('{"version": "v1"}').ok).toBe(false);
  });

  it('wants marketplace.json at the plugin version, pinned to its dist tag', () => {
    expect(distTag('0.5.0')).toBe('dist-v0.5.0');
    expect(checkMarketplace(marketplace, '0.5.0')).toEqual({ ok: true, value: true });
    const behind = checkMarketplace(marketplace, '0.6.0');
    expect(!behind.ok && behind.error.message).toContain('must name version 0.6.0');
    const branch = checkMarketplace(marketplace.replace('"ref": "dist-v0.5.0"', '"ref": "dist"'), '0.5.0');
    expect(!branch.ok && branch.error.message).toContain('"ref": "dist-v0.5.0"');
    const unversioned = checkMarketplace('{"plugins": [{ "ref": "dist-v0.5.0" }]}', '0.5.0');
    expect(!unversioned.ok && unversioned.error.message).toContain('found none');
  });

  it('moves the version and the tag together', () => {
    const next = withRef(withVersion(marketplace, '0.6.0'), distTag('0.6.0'));
    expect(versionsIn(next)).toEqual(['0.6.0', '0.6.0']);
    expect(refsIn(next)).toEqual(['dist-v0.6.0']);
    expect(checkMarketplace(next, '0.6.0').ok).toBe(true);
  });

  it('sets every version and keeps the formatting', () => {
    const next = withVersion(plugin, '0.6.0');
    expect(versionsIn(next)).toEqual(['0.6.0']);
    expect(next).toBe(plugin.replace('0.5.0', '0.6.0'));
  });
});

describe('planRelease', () => {
  it('releases a new version', () => {
    expect(planRelease({ version: '0.5.0', released: ['0.4.0'], pluginChanged: true })).toEqual({ ok: true, value: { kind: 'release', version: '0.5.0' } });
    expect(planRelease({ version: '0.5.0', released: [], pluginChanged: false })).toEqual({ ok: true, value: { kind: 'release', version: '0.5.0' } });
  });

  it('skips a released version when the plugin is unchanged', () => {
    expect(planRelease({ version: '0.5.0', released: ['0.5.0'], pluginChanged: false })).toEqual({ ok: true, value: { kind: 'skip', reason: 'v0.5.0 is already released' } });
  });

  it('fails when the plugin changed without a version bump, or the version went backwards', () => {
    const unbumped = planRelease({ version: '0.5.0', released: ['0.4.0', '0.5.0'], pluginChanged: true });
    expect(!unbumped.ok && unbumped.error.message).toContain('release:version');
    const older = planRelease({ version: '0.4.1', released: ['0.5.0'], pluginChanged: true });
    expect(!older.ok && older.error.message).toContain("isn't newer than the latest release, v0.5.0");
  });
});
