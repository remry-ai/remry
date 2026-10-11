import { describe, it, expect, vi } from 'vitest';
import { ok } from '$shared/utils/result';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import type { PageChat, PageChatJob } from '$shared/types/page-chat';
import { ASK_NOT_FOUND_WARNING, askNotebook, askSearchQuery } from '../ask';

const fakeChat = (claudePath: string | null = '/opt/homebrew/bin/claude') => {
  const jobs: PageChatJob[] = [];
  const pageChat: PageChat = {
    locate: () => claudePath,
    start: (job) => {
      jobs.push(job);
      return ok(undefined);
    },
    running: () => false,
    status: () => ({ state: 'idle' })
  };
  return { pageChat, jobs };
};

const hitRow = {
  entity_type: 'PROJECT',
  entity_id: 'p1',
  parent_type: null,
  parent_id: null,
  title: 'Billing migration',
  body_start: '',
  snippet: 'move **billing** to Stripe',
  score: -1
};

describe('askSearchQuery', () => {
  it('searches for any meaningful word of the question', () => {
    expect(askSearchQuery('Who owns the billing migration?')).toBe('owns OR billing OR migration');
    expect(askSearchQuery('what is Q3')).toBe('q3');
    expect(askSearchQuery('who is it?')).toBeNull();
  });
});

describe('askNotebook', () => {
  it('warns, and starts nothing, without claude', async () => {
    const { pageChat, jobs } = fakeChat(null);
    const reg = createTestRegistry();
    expect(await askNotebook(reg, pageChat, 'work', 'who owns billing?')).toEqual(ok({ started: false, warning: ASK_NOT_FOUND_WARNING }));
    expect(jobs).toEqual([]);
  });

  it('asks Claude with the search hits as linked sources', async () => {
    const { pageChat, jobs } = fakeChat();
    const queryRaw = vi.fn(async () => [hitRow]);
    const reg = createTestRegistry({
      prisma: {
        $queryRawUnsafe: queryRaw,
        person: { findMany: vi.fn(async () => []) },
        group: { findMany: vi.fn(async () => []) },
        project: { findMany: vi.fn(async () => []) },
        goal: { findMany: vi.fn(async () => []) },
        page: { findMany: vi.fn(async () => []) }
      } as unknown as Registry['prisma']
    });
    const result = await askNotebook(reg, pageChat, 'work', 'Who owns billing?');
    expect(result.ok && result.value.started).toBe(true);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.key.startsWith('work/ask-')).toBe(true);
    expect(jobs[0]!.prompt).toContain('[Billing migration](/app/projects/p1): move **billing** to Stripe');
    expect(jobs[0]!.prompt).toContain('Who owns billing?');
  });
});
