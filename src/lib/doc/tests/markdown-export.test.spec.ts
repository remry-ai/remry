import { describe, expect, it } from 'vitest';
import type { ExportNode } from '$shared/types/export-tree';
import { finishMarkdown, planMarkdownExport, relativePath, safeFileName } from '../markdown-export';

const node = (over: Partial<ExportNode> & Pick<ExportNode, 'id' | 'title'>): ExportNode => ({
  kind: 'PAGE', bodyType: 'doc', content: '', status: null, prompt: null, children: [], ...over
});

const CHART = '```chart\n{"type":"bar","labels":["a"],"series":[{"values":[1]}]}\n```';

const tree = node({
  id: 'root', title: 'Handbook',
  content: '# Handbook\n\nSee [Onboarding](/app/wiki/child) and [Alice](/app/people/alice).\n\n![Logo](storage://pages/root/image-1.png "w=200")\n\n<!-- table-cols: 50, 50 -->\n| a | b |\n|---|---|\n\n' + CHART,
  children: [
    node({ id: 'child', title: 'Onboarding', content: 'Back to [the handbook](http://127.0.0.1:7369/app/wiki/root).\n\n![Logo](storage://pages/root/image-1.png)', children: [
      node({ id: 'grand', title: 'Week: one/two', content: 'Hi' })
    ] }),
    node({ id: 'sheet', title: 'Budget', bodyType: 'sheet', content: JSON.stringify({ columns: [{ title: 'Item' }], data: [['Rent']], values: [['Rent']] }) })
  ]
});

const all = new Set(['child', 'grand', 'sheet']);

describe('safeFileName and relativePath', () => {
  it('cleans titles and links between files', () => {
    expect(safeFileName('Week: one/two')).toBe('Week one two');
    expect(safeFileName('  ..  ')).toBe('Untitled');
    expect(relativePath('A/B/c.md', 'images/x y.png')).toBe('../../images/x%20y.png');
    expect(relativePath('A.md', 'A/B.md')).toBe('A/B.md');
    expect(relativePath('A/B.md', 'A.md')).toBe('../A.md');
  });
});

describe('planMarkdownExport, markdown', () => {
  const plan = planMarkdownExport(tree, all, 'markdown');
  const text = (path: string): string => {
    const file = plan.files.find((f) => f.path === path)!;
    return finishMarkdown(file, plan.assets, new Set(plan.assets.map((a) => a.token)), 'markdown');
  };

  it('lays out a file per item beside a folder for what is under it', () => {
    expect(plan.files.map((f) => f.path)).toEqual(['Handbook.md', 'Handbook/Onboarding.md', 'Handbook/Onboarding/Week one two.md', 'Handbook/Budget.md']);
    expect(plan.fileName).toBe('Handbook.zip');
  });

  it('rewrites links, copies images once, draws charts and drops hidden comments', () => {
    const root = text('Handbook.md');
    expect(root).toContain('[Onboarding](Handbook/Onboarding.md)');
    expect(root).toContain('and Alice.');
    expect(root).toContain('![Logo](images/image-1.png)');
    expect(root).toContain('![Chart](images/Handbook-chart-1.png)');
    expect(root).not.toContain('table-cols');
    expect(root).toContain('## Pages\n\n- [Onboarding](Handbook/Onboarding.md)\n- [Budget](Handbook/Budget.md)');
    expect(text('Handbook/Onboarding.md')).toContain('[the handbook](../Handbook.md)');
    expect(text('Handbook/Onboarding.md')).toContain('![Logo](../images/image-1.png)');
    expect(new Set(plan.assets.filter((a) => a.source.kind === 'stored').map((a) => a.path))).toEqual(new Set(['images/image-1.png']));
    expect(text('Handbook/Budget.md')).toContain('# Budget\n\n| Item |');
  });

  it('keeps what it could not draw as text', () => {
    const file = plan.files[0]!;
    const out = finishMarkdown(file, plan.assets, new Set(), 'markdown');
    expect(out).toContain('```chart');
    expect(out).toContain('*Image missing: Logo*');
  });

  it('leaves out an unselected branch with what is under it', () => {
    const some = planMarkdownExport(tree, new Set(['grand', 'sheet']), 'markdown');
    expect(some.files.map((f) => f.path)).toEqual(['Handbook.md', 'Handbook/Budget.md']);
    const root = finishMarkdown(some.files[0]!, some.assets, new Set(), 'markdown');
    expect(root).toContain('See Onboarding and Alice.');
  });

  it('downloads one item without pictures as a .md', () => {
    expect(planMarkdownExport(node({ id: 'x', title: 'Note', content: 'Hello' }), new Set(), 'markdown').fileName).toBe('Note.md');
  });
});

describe('planMarkdownExport, remry', () => {
  const plan = planMarkdownExport(tree, all, 'remry');
  const text = (path: string): string => finishMarkdown(plan.files.find((f) => f.path === path)!, plan.assets, new Set(plan.assets.map((a) => a.token)), 'remry');

  it('keeps the body as stored, with front matter and relative images', () => {
    const root = text('Handbook.md');
    expect(root.startsWith('---\nremry: 1\ntype: page\nid: "root"\ntitle: "Handbook"\nbodyType: doc\n---\n')).toBe(true);
    expect(root).toContain('[Onboarding](/app/wiki/child)');
    expect(root).toContain('<!-- table-cols: 50, 50 -->');
    expect(root).toContain(CHART);
    expect(root).toContain('![Logo](images/image-1.png "w=200")');
    expect(plan.assets.every((a) => a.source.kind === 'stored')).toBe(true);
    expect(text('Handbook/Onboarding.md')).toContain('parent: "root"');
  });

  it('fences a spreadsheet as its JSON', () => {
    expect(text('Handbook/Budget.md')).toMatch(/bodyType: sheet\nparent: "root"\n---\n~~~remry-sheet\n\{.*\}\n~~~\n$/s);
  });

  it('keeps the stored address when the image could not be copied', () => {
    expect(finishMarkdown(plan.files[0]!, plan.assets, new Set(), 'remry')).toContain('![Logo](storage://pages/root/image-1.png "w=200")');
  });
});

describe('a project export', () => {
  const project = node({
    id: 'p', kind: 'PROJECT', title: 'Launch', content: 'The brief.', status: 'in-progress', children: [
      node({ id: 'd', kind: 'DOC', title: 'Plan', content: 'Steps' }),
      node({ id: 'q', kind: 'PROJECT', title: 'Launch', content: '' })
    ]
  });
  it('writes an index with its docs and sub-projects, keeping names apart', () => {
    const plan = planMarkdownExport(project, new Set(['d', 'q']), 'markdown');
    expect(plan.files.map((f) => f.path)).toEqual(['Launch.md', 'Launch/Plan.md', 'Launch/Launch.md']);
    expect(plan.files[0]!.markdown).toBe('# Launch\n\n**Status:** in-progress\n\nThe brief.\n\n## Docs\n\n- [Plan](Launch/Plan.md)\n\n## Projects\n\n- [Launch](Launch/Launch.md)\n');
  });
});
