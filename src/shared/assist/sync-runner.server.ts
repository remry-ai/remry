// Runs the default assistant's CLI for "Sync now", one background job per doc or page. Like the
// file converter and the page chat, only the web app's tRPC context holds this; jobs live in memory.

import { existsSync } from 'node:fs';
import { lastStderrLine, listLlmServers, runLlm } from './claude-process.server';
import { lookupLlm } from './llm-choice.server';
import { linkHosts } from './providers/copilot';
import { llmProvider } from './providers/registry';
import { ok, err } from '$shared/utils/result';
import type { SyncNowJob, SyncNowStatus, SyncRunner } from '$shared/types/sync-now';

// Several sources, each read over the network.
const TIMEOUT_MS = 15 * 60 * 1000;
const LIST_TIMEOUT_MS = 2 * 60 * 1000;

const run = async (job: SyncNowJob): Promise<SyncNowStatus> => {
  const provider = llmProvider(job.llm.provider);
  // The user's connected MCP servers and connectors, so the run can be allowed each by name.
  const servers = await listLlmServers(job.llm, LIST_TIMEOUT_MS);
  const { code, stdout, stderr } = await runLlm(
    job.llm,
    { kind: 'sync', prompt: job.prompt, servers, hosts: linkHosts(job.urls) },
    { cwd: job.cwd && existsSync(job.cwd) ? job.cwd : null, timeoutMs: TIMEOUT_MS }
  );
  if (stdout.trim() === '') {
    const detail = lastStderrLine(stderr);
    return {
      state: 'failed',
      message: code === null
        ? `${provider.name} took longer than 15 minutes, so nothing was changed.`
        : `${provider.name} exited without a reply${detail ? `: ${detail}` : ''}.`
    };
  }
  const reply = provider.parse(stdout, 'sync');
  if (!reply.ok) return { state: 'failed', message: reply.error.message };
  const saved = await job.onReply(reply.value);
  if (!saved.ok) return { state: 'failed', message: saved.error.message };
  return saved.value ? { state: 'done', message: saved.value } : { state: 'done' };
};

export const createSyncRunner = (): SyncRunner => {
  const jobs = new Map<string, SyncNowStatus>();
  return {
    locate: lookupLlm,
    start: (job) => {
      if (jobs.get(job.key)?.state === 'running') return err(new Error(`${llmProvider(job.llm.provider).name} is already syncing this.`));
      jobs.set(job.key, { state: 'running' });
      run(job)
        .catch((error: unknown): SyncNowStatus => ({
          state: 'failed',
          message: `Couldn't run ${llmProvider(job.llm.provider).name}: ${error instanceof Error ? error.message : String(error)}`
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
