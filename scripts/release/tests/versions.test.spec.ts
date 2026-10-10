import { describe, it, expect } from 'vitest';
import { checkMarketplace, compareVersions, planRelease, pluginVersion, versionsIn, withVersion } from '../versions';

const plugin = '{\n  "name": "remry",\n  "version": "0.5.0",\n  "keywords": ["notes"]\n}\n';
const marketplace = '{\n  "metadata": { "description": "Remry" },\n  "plugins": [{ "name": "remry", "keywords": ["a", "b"] }]\n}\n';

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

  it('refuses a version in marketplace.json, which would go live before the dist branch', () => {
    expect(checkMarketplace(marketplace)).toEqual({ ok: true, value: true });
    const versioned = checkMarketplace(marketplace.replace('"name": "remry",', '"name": "remry", "version": "0.5.0",'));
    expect(!versioned.ok && versioned.error.message).toContain('must not name a version');
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
