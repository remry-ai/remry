import { describe, it, expect } from 'vitest';
import { binaryTarget, branchBinaries, mergePlan } from '../package-plan';

describe('binaryTarget', () => {
  it('reads the target from a release binary name', () => {
    expect(binaryTarget('remry-darwin-arm64')).toBe('darwin-arm64');
    expect(binaryTarget('remry-windows-x64.exe')).toBe('windows-x64');
    expect(binaryTarget('VERSION')).toBeNull();
    expect(binaryTarget('migrations')).toBeNull();
  });
});

describe('mergePlan', () => {
  const build = (dir: string, version: string, ...binaries: string[]) => ({ dir, version, binaries });

  it('merges one binary per platform onto the first build', () => {
    const plan = mergePlan([build('/mac', '1.0.0', 'remry-darwin-arm64'), build('/win', '1.0.0', 'remry-windows-x64.exe')]);
    expect(plan.ok && plan.value).toEqual({
      version: '1.0.0',
      base: '/mac',
      copies: [
        { from: '/mac/server/remry-darwin-arm64', name: 'remry-darwin-arm64' },
        { from: '/win/server/remry-windows-x64.exe', name: 'remry-windows-x64.exe' }
      ]
    });
  });

  it('refuses builds of different versions, or two builds of one platform', () => {
    expect(mergePlan([build('/a', '1.0.0', 'remry-linux-x64'), build('/b', '1.0.1', 'remry-darwin-arm64')]).ok).toBe(false);
    const twice = mergePlan([build('/a', '1.0.0', 'remry-linux-x64'), build('/b', '1.0.0', 'remry-linux-x64')]);
    expect(!twice.ok && twice.error.message).toContain('Two builds for linux-x64');
    expect(mergePlan([]).ok).toBe(false);
  });
});

describe('branchBinaries', () => {
  it('keeps binaries git accepts and leaves off the rest', () => {
    const MB = 1024 * 1024;
    expect(branchBinaries([
      { name: 'remry-darwin-arm64', bytes: 81 * MB },
      { name: 'remry-linux-x64', bytes: 120 * MB },
      { name: 'remry-windows-x64.exe', bytes: 95 * MB }
    ])).toEqual({ keep: ['remry-darwin-arm64', 'remry-windows-x64.exe'], omit: ['remry-linux-x64'] });
  });
});
