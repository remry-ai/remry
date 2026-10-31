// Runs the local Claude Code CLI for "Sync now", one background job per doc or page. Like the
// PDF converter and the page chat, only the web app's tRPC context holds this; jobs live in memory.

import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildSyncArgs, connectedMcpServers } from './sync-cli';
import { parseChatOutput } from './claude-cli';
import { lastStderrLine, locateClaude, runClaude } from './claude-process.server';
import { ok, err } from '$shared/utils/result';
import type { SyncNowJob, SyncNowStatus, SyncRunner } from '$shared/types/sync-now';

// Several sources, each read over the network.
const TIMEOUT_MS = 15 * 60 * 1000;
const LIST_TIMEOUT_MS = 2 * 60 * 1000;

/** The user's connected MCP servers and connectors, so the run can be allowed each by name. */
const listServers = async (claudePath: string): Promise<readonly string[]> => {
  const { stdout } = await runClaude(claudePath, ['mcp', 'list'], { cwd: tmpdir(), timeoutMs: LIST_TIMEOUT_MS });
  return connectedMcpServers(stdout);
};

const run = async (job: SyncNowJob): Promise<SyncNowStatus> => {
  const servers = await listServers(job.claudePath);
  const { code, stdout, stderr } = await runClaude(job.claudePath, buildSyncArgs(servers), {
    cwd: job.cwd && existsSync(job.cwd) ? job.cwd : tmpdir(),
    timeoutMs: TIMEOUT_MS,
    stdin: job.prompt
  });
  if (stdout.trim() === '') {
    const detail = lastStderrLine(stderr);
    return {
      state: 'failed',
      message: code === null
        ? 'Claude took longer than 15 minutes, so nothing was changed.'
        : `Claude exited without a reply${detail ? `: ${detail}` : ''}.`
    };
  }
  const reply = parseChatOutput(stdout);
  if (!reply.ok) return { state: 'failed', message: reply.error.message };
  const saved = await job.onReply(reply.value);
  if (!saved.ok) return { state: 'failed', message: saved.error.message };
  return saved.value ? { state: 'done', message: saved.value } : { state: 'done' };
};

export const createSyncRunner = (): SyncRunner => {
  const jobs = new Map<string, SyncNowStatus>();
  return {
    locate: locateClaude,
    start: (job) => {
      if (jobs.get(job.key)?.state === 'running') return err(new Error('Claude is already syncing this.'));
      jobs.set(job.key, { state: 'running' });
      run(job)
        .catch((error: unknown): SyncNowStatus => ({
          state: 'failed',
          message: `Couldn't run Claude: ${error instanceof Error ? error.message : String(error)}`
        }))
        .then((status) => { jobs.set(job.key, status); });
      return ok(undefined);
    },
    status: (key) => {
      const status = jobs.get(key) ?? { state: 'idle' };
      if (status.state === 'failed' || status.state === 'done') jobs.delete(key);
      return status;
    }
  };
};

let runner: SyncRunner | null = null;

export const getSyncRunner = (): SyncRunner => {
  runner ??= createSyncRunner();
  return runner;
};
