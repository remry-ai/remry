import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import type { SyncNowJob, SyncRunner } from '$shared/types/sync-now';
import { startSyncNow, syncJobKey } from '../sync';
import { updatePage } from '$api/page/operations';
import { markLinkSynced } from '$api/attached/link/operations';

// Saving the page and marking links synced are tested with them; here, what a sync does with them.
vi.mock('$api/page/operations', () => ({ updatePage: vi.fn().mockResolvedValue({ ok: true, value: { id: 'pg1' } }) }));
vi.mock('$api/attached/link/operations', () => ({ markLinkSynced: vi.fn().mockResolvedValue({ ok: true, value: {} }) }));

const page = { title: 'Vendors', content: '# Old', prompt: 'Pricing tiers only.', bodyType: 'doc', archivedAt: null };
const links = [
  { id: 'l1', url: 'https://notion.so/acme/Pricing-1', title: 'Notion: Pricing', text: null, sourceEditedAt: null },
  { id: 'l2', url: 'storage://pages/pg1/file-a.pdf', title: 'Quote.pdf', text: '# Quote', sourceEditedAt: null }
];

const setup = (overrides: { page?: object | null; links?: object[] } = {}) => {
  const jobs: SyncNowJob[] = [];
  const runner: SyncRunner = { locate: () => '/usr/local/bin/claude', start: (job) => { jobs.push(job); return { ok: true, value: undefined }; }, status: vi.fn() };
  const reg = createTestRegistry({
    prisma: {
      page: { findUnique: vi.fn().mockResolvedValue(overrides.page === undefined ? { id: 'pg1', ...page } : overrides.page) },
      link: { findMany: vi.fn().mockResolvedValue(overrides.links ?? links) }
    } as unknown as Registry['prisma']
  });
  return { reg, runner, jobs };
};

describe('startSyncNow', () => {
  it('starts one job per page, with each source in the prompt', async () => {
    const { reg, runner, jobs } = setup();
    expect(await startSyncNow(reg, runner, 'work', 'PAGE', 'pg1')).toEqual({ ok: true, value: { started: true } });
    expect(jobs.map((j) => [j.key, j.cwd])).toEqual([[syncJobKey('work', 'PAGE', 'pg1'), '/files/pages/pg1']]);
    expect(jobs[0]!.prompt).toContain('url="https://notion.so/acme/Pricing-1"');
    expect(jobs[0]!.prompt).toContain('# Quote');
  });

  it('saves the text and marks what it read synced, saying what it couldn\'t read', async () => {
    const { reg, runner, jobs } = setup();
    await startSyncNow(reg, runner, 'work', 'PAGE', 'pg1');
    const saved = await jobs[0]!.onReply('# New\n<!-- sources\nl1 read 2026-10-28T16:30:00Z\nl2 unread blank scan\n-->');
    expect(saved).toEqual({ ok: true, value: 'Synced, except: Quote.pdf (blank scan).' });
    expect(updatePage).toHaveBeenLastCalledWith(reg, 'pg1', { content: '# New' });
    expect(markLinkSynced).toHaveBeenCalledWith(reg, 'l1', new Date('2026-10-28T16:30:00Z'));
    expect(markLinkSynced).not.toHaveBeenCalledWith(reg, 'l2', expect.anything());
  });

  it('refuses a page with no prompt, a spreadsheet and one with no sources, and warns without claude', async () => {
    const noPrompt = setup({ page: { id: 'pg1', ...page, prompt: null } });
    expect((await startSyncNow(noPrompt.reg, noPrompt.runner, 'work', 'PAGE', 'pg1')).ok).toBe(false);
    const sheet = setup({ page: { id: 'pg1', ...page, bodyType: 'sheet' } });
    expect((await startSyncNow(sheet.reg, sheet.runner, 'work', 'PAGE', 'pg1')).ok).toBe(false);
    const empty = setup({ links: [] });
    const none = await startSyncNow(empty.reg, empty.runner, 'work', 'PAGE', 'pg1');
    expect(!none.ok && none.error.message).toContain('Add a source first');
    const noClaude = setup();
    const warned = await startSyncNow(noClaude.reg, { ...noClaude.runner, locate: () => null }, 'work', 'PAGE', 'pg1');
    expect(warned.ok && !warned.value.started).toBe(true);
  });
});
