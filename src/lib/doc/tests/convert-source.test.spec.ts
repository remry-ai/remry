import { describe, it, expect, vi } from 'vitest';
import { convertAndWait } from '../convert-source';

describe('convertAndWait', () => {
  const noWait = () => Promise.resolve();

  it('returns the warning without polling when claude is not installed', async () => {
    const status = vi.fn();
    const result = await convertAndWait({ start: async () => ({ started: false, warning: 'Install Claude Code' }), status, wait: noWait });
    expect(result).toBe('Install Claude Code');
    expect(status).not.toHaveBeenCalled();
  });

  it('polls until the job is no longer running', async () => {
    const states = ['running', 'running', 'idle'] as const;
    const status = vi.fn(async () => ({ state: states[status.mock.calls.length - 1]! }));
    const result = await convertAndWait({ start: async () => ({ started: true }), status, wait: noWait });
    expect(result).toBeNull();
    expect(status).toHaveBeenCalledTimes(3);
  });

  it('throws with Claude\'s message when it fails', async () => {
    await expect(convertAndWait({ start: async () => ({ started: true }), status: async () => ({ state: 'failed', message: 'Out of credit' }), wait: noWait })).rejects.toThrow('Out of credit');
  });
});
