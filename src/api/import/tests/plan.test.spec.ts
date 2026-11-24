import { describe, expect, it } from 'vitest';
import { importImagesIn, normalizeImportPath, planImport, readFrontMatter, resolveImportLink, rewriteImportedText, type ImportFile } from '../plan';

const enc = new TextEncoder();
const md = (path: string, text: string): ImportFile => ({ path, bytes: enc.encode(text) });
const img = (path: string): ImportFile => ({ path, bytes: new Uint8Array([1, 2, 3]) });

describe('paths', () => {
  it('normalizes and refuses what climbs out or is hidden', () => {
    expect(normalizeImportPath('./A\\B/../c.md')).toBe('A/c.md');
    expect(normalizeImportPath('../x.md')).toBeNull();
    expect(normalizeImportPath('__MACOSX/a.md')).toBeNull();
    expect(normalizeImportPath('A/.DS_Store')).toBeNull();
  });

  it('resolves relative links from a file', () => {
    expect(resolveImportLink('Handbook/Onboarding.md', '../images/x%20y.png')).toBe('images/x y.png');
    expect(resolveImportLink('A.md', 'A/B.md#top')).toBe('A/B.md');
    expect(resolveImportLink('A.md', 'https://example.com/x.png')).toBeNull();
    expect(resolveImportLink('A.md', '/app/wiki/x')).toBeNull();
    expect(resolveImportLink('A.md', '../../x.png')).toBeNull();
  });
});

describe('readFrontMatter', () => {
  it('reads quoted and bare values and leaves the body', () => {
    const fm = readFrontMatter('---\nremry: 1\ntitle: "Q3: \\"plan\\""\nbodyType: doc\nother: \'it\'\'s\'\n---\n# Body\n');
    expect(fm.fields).toEqual({ remry: '1', title: 'Q3: "plan"', bodyType: 'doc', other: "it's" });
    expect(fm.body).toBe('# Body\n');
  });

  it('is empty without front matter', () => {
    expect(readFrontMatter('Hello').fields).toEqual({});
  });
});

describe('planImport', () => {
  it('reads a Remry export: kinds, ids, parents, fenced bodies', () => {
    const plan = planImport([
      md('Launch/Plan.md', '---\nremry: 1\ntype: doc\nid: "d1"\ntitle: "Plan"\nbodyType: sheet\nparent: "p1"\n---\n~~~remry-sheet\n{"columns":[]}\n~~~\n'),
      md('Launch.md', '---\nremry: 1\ntype: project\nid: "p1"\ntitle: "Launch"\nstatus: "in-progress"\n---\nThe brief\n'),
      img('images/a.png'),
      md('notes.txt', 'x')
    ]);
    expect(plan.items.map((i) => [i.key, i.kind, i.parentKey])).toEqual([['p1', 'PROJECT', null], ['d1', 'DOC', 'p1']]);
    expect(plan.items[0]!.status).toBe('in-progress');
    expect(plan.items[1]!.body).toBe('{"columns":[]}');
    expect([...plan.images.keys()]).toEqual(['images/a.png']);
    expect(plan.ignored).toEqual(['notes.txt']);
  });

  it('makes plain markdown pages, folders as the tree, dropping a repeated title line', () => {
    const plan = planImport([
      md('Vault/Guide/Setup/Install.md', 'Steps'),
      md('Vault/Guide.md', '# Guide\n\nIntro'),
      md('Vault/Other.md', '---\ntitle: Something else\n---\nText')
    ]);
    const byTitle = new Map(plan.items.map((i) => [i.title, i]));
    expect(byTitle.get('Guide')!.body).toBe('Intro');
    expect(byTitle.get('Install')!.parentKey).toBe('file:Vault/Guide.md');
    expect(byTitle.get('Something else')!.parentKey).toBeNull();
    expect(plan.items.findIndex((i) => i.title === 'Guide')).toBeLessThan(plan.items.findIndex((i) => i.title === 'Install'));
  });

  it('breaks a parent loop and keeps a repeated id apart', () => {
    const plan = planImport([
      md('a.md', '---\nremry: 1\ntype: page\nid: "a"\ntitle: "A"\nparent: "b"\n---\n'),
      md('b.md', '---\nremry: 1\ntype: page\nid: "b"\ntitle: "B"\nparent: "a"\n---\n'),
      md('c.md', '---\nremry: 1\ntype: page\nid: "a"\ntitle: "Copy"\n---\n')
    ]);
    expect(plan.items).toHaveLength(3);
    expect(plan.items.filter((i) => i.parentKey === null).length).toBeGreaterThanOrEqual(1);
    expect(plan.items.find((i) => i.title === 'Copy')!.key).toBe('file:c.md');
  });
});

describe('rewriting text', () => {
  const images = new Map([['images/a.png', new Uint8Array()]]);
  const body = [
    '![Logo](../images/a.png "w=200") ![Gone](../images/b.png)',
    'See [B](/app/wiki/b), [doc](/app/projects/p1?doc=d1), [file](B.md), [web](https://x.y) and [other](/app/wiki/zzz).',
    '```',
    '![Code](../images/a.png)',
    '```'
  ].join('\n');
  const ctx = {
    pathOf: (key: string) => ({ b: '/app/wiki/NEW_B', d1: '/app/projects/NP?doc=ND', 'file:Dir/B.md': '/app/wiki/FILE_B' } as Record<string, string>)[key] ?? null,
    keyForId: (id: string) => (['b', 'd1'].includes(id) ? id : null),
    keyForFile: (path: string) => (path === 'Dir/B.md' ? 'file:Dir/B.md' : null),
    storedImage: (path: string) => (path === 'images/a.png' ? 'pages/new/image-1.png' : null)
  };

  it('finds images outside code', () => {
    expect(importImagesIn(body, 'Dir/A.md', images)).toEqual(['images/a.png']);
  });

  it('stores images, notes missing ones and points links at new items', () => {
    const { text, missing } = rewriteImportedText(body, 'Dir/A.md', ctx);
    expect(text).toContain('![Logo](storage://pages/new/image-1.png "w=200")');
    expect(text).toContain('*Image lost: Gone. Paste it again.*');
    expect(text).toContain('[B](/app/wiki/NEW_B)');
    expect(text).toContain('[doc](/app/projects/NP?doc=ND)');
    expect(text).toContain('[file](/app/wiki/FILE_B)');
    expect(text).toContain('[web](https://x.y)');
    expect(text).toContain('[other](/app/wiki/zzz)');
    expect(text).toContain('```\n![Code](../images/a.png)\n```');
    expect(missing).toEqual(['images/b.png']);
  });
});
