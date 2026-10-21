import { describe, it, expect } from 'vitest';
import { foreignImagesIn, imageNamesIn, planImageTidy, planTrashPurge, REMOVED_GRACE_MS, refuseBlobUrls, trashKey } from '../_images';

describe('refuseBlobUrls', () => {
  it('refuses an image still at a temporary blob: address', () => {
    const result = refuseBlobUrls('Before\n\n![shot.png](blob:http://127.0.0.1:7369/428e37a0-9454)\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Paste or drop it again');
  });

  it('allows stored images, files-route paths and text that only mentions blob:', () => {
    expect(refuseBlobUrls('![a](storage://pages/p1/image-1.png) ![b](/files/docs/d1/image-2.png "w=393")').ok).toBe(true);
    expect(refuseBlobUrls('A `blob:` URL lasts as long as its tab.').ok).toBe(true);
  });
});

describe('imageNamesIn', () => {
  it('reads the folder\'s images shown as storage keys or files-route paths, and nothing else', () => {
    const content = [
      '![a](storage://docs/d1/image-a.png)',
      '![b](/files/docs/d1/image-b.png "w=393")',
      '![other doc](/files/docs/d2/image-c.png)',
      '[the pdf](/files/docs/d1/source-x.pdf)'
    ].join('\n');
    expect([...imageNamesIn(content, 'docs/d1')].sort()).toEqual(['image-a.png', 'image-b.png', 'source-x.pdf']);
  });
});

describe('planImageTidy', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const file = (name: string, ageMs = 0) => ({ name, modifiedAt: new Date(now.getTime() - ageMs) });

  it('moves images out of the text aside, and leaves the PDF and shown images', () => {
    const plan = planImageTidy(new Set(['image-a.png']), [file('image-a.png'), file('image-b.png'), file('source-x.pdf')], [], now);
    expect(plan).toEqual({ restore: [], remove: ['image-b.png'], purge: [] });
  });

  it('brings back an image the text shows again (an undo), and deletes ones removed over a day ago', () => {
    const plan = planImageTidy(
      new Set(['image-a.png', 'image-old.png']),
      [],
      [file('image-a.png', 60_000), file('image-old.png', REMOVED_GRACE_MS * 2), file('image-gone.png', REMOVED_GRACE_MS + 1), file('image-recent.png', 60_000)],
      now
    );
    expect(plan).toEqual({ restore: ['image-a.png', 'image-old.png'], remove: [], purge: ['image-gone.png'] });
  });
});

describe('foreignImagesIn', () => {
  it("finds the images the text shows from other docs' and pages' folders, each once", () => {
    const content = [
      '![own](storage://docs/d1/image-a.png)',
      '![old doc](storage://docs/d0/image-b.webp)',
      '![again](storage://docs/d0/image-b.webp)',
      '![page](/files/pages/p9/image-c.jpg)',
      '![tidied](storage://docs/d0/removed/image-d.gif)',
      '![pdf](storage://docs/d0/source-x.pdf)'
    ].join('\n');
    expect(foreignImagesIn(content, 'docs/d1')).toEqual([
      { key: 'docs/d0/image-b.webp', folder: 'docs/d0', name: 'image-b.webp' },
      { key: 'pages/p9/image-c.jpg', folder: 'pages/p9', name: 'image-c.jpg' },
      { key: 'docs/d0/removed/image-d.gif', folder: 'docs/d0', name: 'image-d.gif' }
    ]);
  });
});

describe('the trash', () => {
  it("names an image for where it came from, and empties what's been there over a day", () => {
    expect(trashKey('docs/d1', 'image-a.png')).toBe('trash/docs.d1.image-a.png');
    const now = new Date('2026-10-21T12:00:00Z');
    const at = (ms: number) => new Date(now.getTime() - ms);
    expect(planTrashPurge([
      { name: 'docs.d1.image-old.png', modifiedAt: at(REMOVED_GRACE_MS + 1) },
      { name: 'docs.d1.image-new.png', modifiedAt: at(60_000) }
    ], now)).toEqual(['docs.d1.image-old.png']);
  });
});
