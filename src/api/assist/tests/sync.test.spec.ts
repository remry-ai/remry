import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import type { SyncNowJob, SyncRunner } from '$shared/types/sync-now';
import { startSyncNow, syncJobKey } from '../sync';
import { saveSyncText } from '$api/attached/sync/operations';
import { recordSync } from '$api/_last-sync';
import { fakeLookup } from './fake-llm';

// Saving the text and marking sources synced are tested with them; here, what a sync does with them.
vi.mock('$api/attached/sync/operations', () => ({ saveSyncText: vi.fn().mockResolvedValue({ ok: true, value: { entityType: 'PAGE', id: 'pg1' } }) }));
vi.mock('$api/_last-sync', () => ({
  recordSync: vi.fn().mockResolvedValue(undefined),
  findSyncTarget: vi.fn((_reg: unknown, holder: { entityId: string }) => Promise.resolve({ entityType: 'PAGE', id: holder.entityId }))
}));

const holder = { entityType: 'PAGE' as const, entityId: 'pg1' };

const page = { title: 'Vendors', content: '# Old', prompt: 'Pricing tiers only.', bodyType: 'doc', archivedAt: null };
const links = [
  { id: 'l1', url: 'https://notion.so/acme/Pricing-1', title: 'Notion: Pricing', text: null, sourceEditedAt: null },
  { id: 'l2', url: 'storage://pages/pg1/file-a.pdf', title: 'Quote.pdf', text: '# Quote', sourceEditedAt: null }
];

const setup = (overrides: { page?: object | null; links?: object[] } = {}) => {
  const jobs: SyncNowJob[] = [];
  const runner: SyncRunner = { locate: fakeLookup('/usr/local/bin/claude'), start: (job) => { jobs.push(job); return { ok: true, value: undefined }; }, status: vi.fn(), connectors: vi.fn().mockResolvedValue({ servers: [{ name: 'claude.ai Linear', status: 'connected' }], apiKeySource: 'none' }) };
  const reg = createTestRegistry({
    prisma: {
      page: { findUnique: vi.fn().mockResolvedValue(overrides.page === undefined ? { id: 'pg1', ...page } : overrides.page) },
      link: { findMany: vi.fn().mockResolvedValue(overrides.links ?? links) },
      $transaction: vi.fn()
    } as unknown as Registry['prisma']
  });
  return { reg, runner, jobs };
};

describe('startSyncNow', () => {
  it('starts one job per synced entity, with each of its sources in the prompt, run in its folder', async () => {
    const { reg, runner, jobs } = setup();
    expect(await startSyncNow(reg, runner, 'work', holder)).toEqual({ ok: true, value: { started: true } });
    expect(jobs.map((j) => [j.key, j.cwd])).toEqual([[syncJobKey('work', holder), '/files/pages/pg1']]);
    expect(jobs[0]!.prompt).toContain('url="https://notion.so/acme/Pricing-1"');
    expect(jobs[0]!.prompt).toContain('# Quote');
  });

  it('saves the text and marks what it read synced, saying what it couldn\'t read', async () => {
    const { reg, runner, jobs } = setup();
    await startSyncNow(reg, runner, 'work', holder);
    const saved = await jobs[0]!.onReply('# New\n<!-- sources\nl1 read 2026-10-28T16:30:00Z\nl2 unread blank scan\n-->', { probe: { servers: [{ name: 'claude.ai Linear', status: 'connected' }], apiKeySource: 'none' } });
    expect(saved.ok && saved.value?.split('\n').slice(0, 2)).toEqual(['Synced from 1 of 2 sources.', "Couldn't read: Quote.pdf (blank scan)."]);
    // Only what it read is marked synced.
    expect(saveSyncText).toHaveBeenLastCalledWith(reg, holder, '# New', [{ id: 'l1', editedAt: new Date('2026-10-28T16:30:00Z') }]);
  });

  it('saves how it went as the last sync: done, done with sources unread, or failed', async () => {
    const { reg, runner, jobs } = setup();
    await startSyncNow(reg, runner, 'work', holder);
    await jobs[0]!.onFinish!({ state: 'done' });
    expect(recordSync).toHaveBeenLastCalledWith(reg, 'PAGE', 'pg1', { by: 'APP', outcome: 'OK', message: null });
    await jobs[0]!.onFinish!({ state: 'done', message: 'Synced, except: Quote.pdf (blank scan).' });
    expect(recordSync).toHaveBeenLastCalledWith(reg, 'PAGE', 'pg1', { by: 'APP', outcome: 'PARTIAL', message: 'Synced, except: Quote.pdf (blank scan).' });
    await jobs[0]!.onFinish!({ state: 'failed', message: 'Claude Code took longer than 15 minutes, so nothing was changed.' });
    expect(recordSync).toHaveBeenLastCalledWith(reg, 'PAGE', 'pg1', { by: 'APP', outcome: 'FAILED', message: 'Claude Code took longer than 15 minutes, so nothing was changed.' });
  });

  it('refuses a page with no prompt, a spreadsheet and one with no sources, and warns without claude', async () => {
    const noPrompt = setup({ page: { id: 'pg1', ...page, prompt: null } });
    expect((await startSyncNow(noPrompt.reg, noPrompt.runner, 'work', holder)).ok).toBe(false);
    const sheet = setup({ page: { id: 'pg1', ...page, bodyType: 'sheet' } });
    expect((await startSyncNow(sheet.reg, sheet.runner, 'work', holder)).ok).toBe(false);
    const empty = setup({ links: [] });
    const none = await startSyncNow(empty.reg, empty.runner, 'work', holder);
    expect(!none.ok && none.error.message).toContain('Choose a source first');
    const noClaude = setup();
    const warned = await startSyncNow(noClaude.reg, { ...noClaude.runner, locate: fakeLookup(null) }, 'work', holder);
    expect(warned.ok && !warned.value.started).toBe(true);
  });

  it('names the tools it has no connector for, and changes nothing when it read none', async () => {
    const { reg, runner, jobs } = setup();
    await startSyncNow(reg, runner, 'work', holder);
    const failed = await jobs[0]!.onReply('Sorry.\n<!-- sources\nl1 unread needs sign-in\nl2 unread blank scan\n-->', { probe: { servers: [{ name: 'claude.ai Linear', status: 'connected' }], apiKeySource: 'none' } });
    const message = !failed.ok ? failed.error.message : '';
    expect(message).toContain("couldn't read any of the sources, so nothing was changed.");
    expect(message).toContain('Notion: Pricing (needs sign-in)');
    expect(message).toContain('Claude Code has no Notion connector');
    expect(message).toContain('Ask Claude to sync');
  });
});
