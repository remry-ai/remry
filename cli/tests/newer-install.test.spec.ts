import { describe, it, expect } from 'vitest';
import { handOffCommand, handOffEnv, outcomeFromCli, shouldHandOff } from '../newer-install';

describe('shouldHandOff', () => {
  it('hands calls on only when a newer version is installed', () => {
    expect(shouldHandOff('0.16.41', '0.16.43')).toBe(true);
    expect(shouldHandOff('0.16.43', '0.16.43')).toBe(false);
    // A Claude session started after the update, with an older app still installed somewhere: keep its own.
    expect(shouldHandOff('0.16.43', '0.16.41')).toBe(false);
    expect(shouldHandOff('0.16.41', null)).toBe(false);
    expect(shouldHandOff('0.16.41', 'garbage')).toBe(false);
  });
});

describe('handOffCommand', () => {
  it('runs the installed binary for a release, and the clone with Bun', () => {
    const o = { binary: '/data/App/current/remry', execPath: '/bin/bun', repoDir: '/code/remry' };
    expect(handOffCommand({ ...o, standalone: true })).toEqual({ command: '/data/App/current/remry', args: [] });
    expect(handOffCommand({ ...o, standalone: false })).toEqual({ command: '/bin/bun', args: ['/code/remry/cli/main.ts'] });
  });
});

describe('handOffEnv', () => {
  it("leaves out what a release binary sets for itself, so the newer one finds its own migrations", () => {
    const env = handOffEnv({ HOME: '/u', REMRY_NOTEBOOK: 'work', REMRY_STANDALONE: '1', REMRY_MIGRATIONS_DIR: '/data/App/0.16.41/migrations', REMRY_VERSION: '0.16.41' });
    expect(env).toEqual({ HOME: '/u', REMRY_NOTEBOOK: 'work' });
  });
});

describe('outcomeFromCli', () => {
  it('reads the JSON result, failed or not', () => {
    expect(outcomeFromCli(0, '{"ok":true,"value":1}', '')).toEqual({ kind: 'result', result: { ok: true, value: 1 }, failed: false });
    expect(outcomeFromCli(1, '{"ok":false,"error":{"message":"no"}}', '')).toEqual({ kind: 'result', result: { ok: false, error: { message: 'no' } }, failed: true });
  });

  it('throws the error the CLI wrote when there is no result', () => {
    expect(() => outcomeFromCli(1, '', 'Error: Unknown notebook: x\n')).toThrow('Unknown notebook: x');
    expect(() => outcomeFromCli(1, '', '')).toThrow('remry exited with code 1');
  });
});
