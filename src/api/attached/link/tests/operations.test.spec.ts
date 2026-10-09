import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { addLink, findLinks, markLinkSynced } from '../operations';
import { linkSearchKey, normalizeLinkUrl } from '../url';

describe('normalizeLinkUrl', () => {
  it('ignores protocol, www, host case, trailing slash, fragment and tracking parameters', () => {
    const forms = [
      'https://linear.app/acme/issue/ENG-123/fix-login',
      'http://www.Linear.app/acme/issue/ENG-123/fix-login/',
      'https://linear.app/acme/issue/ENG-123/fix-login#comment-4',
      'https://linear.app/acme/issue/ENG-123/fix-login?utm_source=slack'
    ];
    expect(new Set(forms.map(normalizeLinkUrl))).toEqual(new Set(['linear.app/acme/issue/ENG-123/fix-login']));
  });

  it('keeps meaningful query parameters, in a stable order', () => {
    expect(normalizeLinkUrl('https://example.com/view?b=2&a=1')).toBe('example.com/view?a=1&b=2');
    expect(normalizeLinkUrl('https://example.com/view?id=1')).not.toBe(normalizeLinkUrl('https://example.com/view?id=2'));
  });

  it('keeps path case, and leaves text that is not a URL as it is', () => {
    expect(normalizeLinkUrl('https://notion.so/Roadmap-abc')).not.toBe(normalizeLinkUrl('https://notion.so/roadmap-abc'));
    expect(normalizeLinkUrl('  ENG-123 ')).toBe('ENG-123');
  });
});

describe('linkSearchKey', () => {
  it('uses the path, or the host when there is none', () => {
    expect(linkSearchKey('https://www.notion.so/acme/Roadmap-abc/?pvs=4')).toBe('/acme/Roadmap-abc');
    expect(linkSearchKey('https://Example.com/')).toBe('example.com');
  });
});

describe('findLinks', () => {
  const row = (id: string, url: string, entityId: string) => ({
    id, url, title: null, syncedAt: null, createdAt: new Date(0), entityType: 'PROJECT', entityId
  });

  const registry = (rows: readonly ReturnType<typeof row>[]) => {
    const findMany = vi.fn().mockResolvedValue(rows);
    const reg = createTestRegistry({
      prisma: {
        link: { findMany },
        project: {
          findUnique: vi.fn(({ where }: { where: { id: string } }) =>
            Promise.resolve(where.id === 'gone' ? null : { name: `Project ${where.id}` }))
        }
      } as unknown as Registry['prisma']
    });
    return { reg, findMany };
  };

  it('needs a url or text to look for', async () => {
    const { reg } = registry([]);
    const result = await findLinks(reg, {});
    expect(!result.ok && result.error.message).toContain('--url');
  });

  it('matches a URL however it was written, and names the entity', async () => {
    const { reg, findMany } = registry([
      row('l1', 'http://www.linear.app/acme/issue/ENG-123/fix-login/', 'p1'),
      row('l2', 'https://linear.app/acme/issue/ENG-123/fix-login-sub', 'p2')
    ]);
    const result = await findLinks(reg, { url: 'https://linear.app/acme/issue/ENG-123/fix-login' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { url: { contains: '/acme/issue/ENG-123/fix-login' } }
    }));
    expect(result.ok && result.value.map((m) => [m.id, m.label, m.path])).toEqual([
      ['l1', 'Project p1', '/app/projects/p1']
    ]);
  });

  it('with contains, returns every link containing the text, skipping deleted entities', async () => {
    const { reg, findMany } = registry([
      row('l1', 'https://linear.app/acme/issue/ENG-123/old-title', 'p1'),
      row('l2', 'https://linear.app/acme/issue/ENG-123/new-title', 'gone')
    ]);
    const result = await findLinks(reg, { contains: 'ENG-123' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { url: { contains: 'ENG-123' } } }));
    expect(result.ok && result.value.map((m) => m.id)).toEqual(['l1']);
  });
});

describe('syncedAt', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const group = { findUnique: vi.fn().mockResolvedValue({ name: 'Platform', archivedAt: null }) };

  it('link.add stamps syncedAt only when the link is a sync source', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'l1' });
    const reg = createTestRegistry({ now: () => now, prisma: { group, link: { create } } as unknown as Registry['prisma'] });
    await addLink(reg, 'GROUP', 't1', { url: 'https://linear.app/acme', synced: true });
    await addLink(reg, 'GROUP', 't1', { url: 'https://example.com' });
    expect(create.mock.calls.map(([arg]) => arg.data.syncedAt)).toEqual([now, null]);
  });

  it('markSynced sets syncedAt to now', async () => {
    const update = vi.fn();
    const reg = createTestRegistry({
      now: () => now,
      prisma: {
        group,
        link: { findUnique: vi.fn().mockResolvedValue({ id: 'l1', entityType: 'GROUP', entityId: 't1' }), update }
      } as unknown as Registry['prisma']
    });
    const result = await markLinkSynced(reg, 'l1');
    expect(result.ok && result.value).toEqual({ id: 'l1', syncedAt: now });
    expect(update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { syncedAt: now } });
  });

  it('markSynced says how to recover from an unknown link', async () => {
    const reg = createTestRegistry({
      prisma: { link: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma']
    });
    const result = await markLinkSynced(reg, 'nope');
    expect(!result.ok && result.error.message).toContain('link.find');
  });
});
