import { describe, it, expect } from 'vitest';
import { updaterManifest } from '../updater-manifest';

describe('updaterManifest', () => {
  const base = { version: '0.16.0', repo: 'remry-ai/remry', pubDate: '2026-10-12T00:00:00.000Z' };

  it('lists each platform with a signed update, pointing at its release asset', () => {
    const manifest = updaterManifest({
      ...base,
      signatures: new Map([
        ['Remry-0.16.0-macos-arm64.app.tar.gz', 'mac-sig\n'],
        ['Remry-0.16.0-windows-x64-setup.exe', 'win-sig']
      ])
    });
    expect(manifest).toEqual({
      version: '0.16.0',
      pub_date: base.pubDate,
      notes: 'Remry 0.16.0',
      platforms: {
        'darwin-aarch64': { signature: 'mac-sig', url: 'https://github.com/remry-ai/remry/releases/download/v0.16.0/Remry-0.16.0-macos-arm64.app.tar.gz' },
        'windows-x86_64': { signature: 'win-sig', url: 'https://github.com/remry-ai/remry/releases/download/v0.16.0/Remry-0.16.0-windows-x64-setup.exe' }
      }
    });
  });

  it('leaves out a platform that did not build, and writes nothing with no signed update', () => {
    const macOnly = updaterManifest({ ...base, signatures: new Map([['Remry-0.16.0-macos-arm64.app.tar.gz', 'mac-sig']]) });
    expect(Object.keys(macOnly?.platforms ?? {})).toEqual(['darwin-aarch64']);
    expect(updaterManifest({ ...base, signatures: new Map() })).toBeNull();
  });
});
