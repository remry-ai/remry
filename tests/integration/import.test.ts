// entity.import: a Remry markdown export read back. Exported from one notebook (the app's own
// planner, `lib/doc/markdown-export.ts`, and ZIP writer), imported into another: the page tree,
// a project with its docs, images stored on their items, links between them pointed at the new
// ids. Then into the same notebook, where ids already there are skipped or overwritten; and
// plain markdown, where folders make the tree.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { getReadyRegistry } from '../../src/shared/db/bootstrap.server';
import { createPage, getPage, updatePage, uploadPageImage } from '../../src/api/page/operations';
import { createProject } from '../../src/api/project/operations';
import { addDoc, updateDoc } from '../../src/api/attached/doc/operations';
import { exportTree } from '../../src/api/entity/export-tree';
import { importMarkdown } from '../../src/api/import/operations';
import { planMarkdownExport, finishMarkdown } from '../../src/lib/doc/markdown-export';
import { buildZip } from '../../src/lib/doc/zip';
import { readZip } from '../../src/api/import/zip';
import type { ExportNodeKind } from '../../src/shared/types/export-tree';
import type { ImportFile } from '../../src/api/import/plan';
import { TEST_NOTEBOOK, OTHER_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);
// The empty second notebook, migrated when first opened (setup makes the data folder afresh first).
const otherNotebook = (): ReturnType<typeof getReadyRegistry> => getReadyRegistry(OTHER_NOTEBOOK);
const allow = { allowDrawings: async () => ({ ok: true as const, value: undefined }) };

const value = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

// A 1×1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** What the app's Remry markdown export downloads, as a .zip, unpacked again. */
const exportZip = async (kind: ExportNodeKind, id: string): Promise<readonly ImportFile[]> => {
  const root = value(await exportTree(reg, kind, id));
  const all = new Set<string>();
  const walk = (n: typeof root): void => n.children.forEach((c) => { all.add(c.id); walk(c); });
  walk(root);
  const plan = planMarkdownExport(root, all, 'remry');
  const pictures = [];
  for (const asset of plan.assets) {
    if (asset.source.kind !== 'stored') continue;
    const file = await reg.storage.readObject(asset.source.key);
    if (file) pictures.push({ path: asset.path, data: new Uint8Array(file.bytes) });
  }
  const drawn = new Set(plan.assets.map((a) => a.token));
  const enc = new TextEncoder();
  const zip = buildZip([...plan.files.map((f) => ({ path: f.path, data: enc.encode(finishMarkdown(f, plan.assets, drawn, 'remry')) })), ...pictures]);
  return value(readZip(zip));
};

describe('entity.import', () => {
  it('reads a page tree back into another notebook, with its images and links', async () => {
    const root = value(await createPage(reg, { title: 'Import handbook', content: 'Root' }));
    const child = value(await createPage(reg, { title: 'Import onboarding', parentId: root.id }));
    const image = value(await uploadPageImage(reg, child.id, PNG));
    value(await updatePage(reg, child.id, { content: `Back to [handbook](/app/wiki/${root.id}).\n\n${image.markdown}` }));
    value(await updatePage(reg, root.id, { content: `See [onboarding](/app/wiki/${child.id}).` }));

    const files = await exportZip('PAGE', root.id);
    const other = await otherNotebook();
    const result = value(await importMarkdown(other, { files }, allow));
    expect(result).toMatchObject({ created: 2, updated: 0, skipped: 0, images: 1, imagesMissing: [], problems: [] });

    const [newRoot, newChild] = result.items;
    expect(newRoot!.top && !newChild!.top).toBe(true);
    const rootPage = value(await getPage(other, newRoot!.id));
    const childPage = value(await getPage(other, newChild!.id));
    expect(rootPage.content).toBe(`See [onboarding](/app/wiki/${newChild!.id}).`);
    expect(childPage.parentId).toBe(newRoot!.id);
    expect(childPage.content).toContain(`[handbook](/app/wiki/${newRoot!.id})`);
    const key = /storage:\/\/(pages\/[^)\s]+)/.exec(childPage.content)![1]!;
    expect(key.startsWith(`pages/${newChild!.id}/`)).toBe(true);
    expect(await other.storage.readObject(key)).not.toBeNull();
  });

  it('reads a project with its docs and sub-projects', async () => {
    const project = value(await createProject(reg, { name: 'Import launch', description: 'The brief', status: 'blocked' }));
    const sub = value(await createProject(reg, { name: 'Import website', parentId: project.id }));
    const doc = value(await addDoc(reg, 'PROJECT', project.id, { title: 'Plan' }));
    value(await updateDoc(reg, doc.id, { content: `Then [the site](/app/projects/${sub.id}).` }));
    value(await addDoc(reg, 'PROJECT', sub.id, { title: 'Budget', bodyType: 'sheet' }));

    const other = await otherNotebook();
    const result = value(await importMarkdown(other, { files: await exportZip('PROJECT', project.id) }, allow));
    expect(result.problems).toEqual([]);
    expect(result.items.map((i) => `${i.kind}:${i.title}`).sort()).toEqual(['DOC:Budget', 'DOC:Plan', 'PROJECT:Import launch', 'PROJECT:Import website']);
    const byTitle = new Map(result.items.map((i) => [i.title, i]));
    const [p, plan, website, budget] = ['Import launch', 'Plan', 'Import website', 'Budget'].map((t) => byTitle.get(t));
    const row = await other.prisma.project.findUnique({ where: { id: p!.id } });
    expect(row).toMatchObject({ description: 'The brief', status: 'blocked' });
    expect((await other.prisma.project.findUnique({ where: { id: website!.id } }))!.parentId).toBe(p!.id);
    const planRow = await other.prisma.doc.findUnique({ where: { id: plan!.id } });
    expect(planRow).toMatchObject({ entityType: 'PROJECT', entityId: p!.id, content: `Then [the site](/app/projects/${website!.id}).` });
    expect((await other.prisma.doc.findUnique({ where: { id: budget!.id } }))).toMatchObject({ entityId: website!.id, bodyType: 'sheet' });
  });

  it('skips or overwrites ids already in the notebook', async () => {
    const page = value(await createPage(reg, { title: 'Import same', content: 'Original' }));
    const files = await exportZip('PAGE', page.id);
    value(await updatePage(reg, page.id, { content: 'Changed since' }));

    const skipped = value(await importMarkdown(reg, { files }, allow));
    expect(skipped).toMatchObject({ created: 0, skipped: 1 });
    expect(value(await getPage(reg, page.id)).content).toBe('Changed since');

    const overwritten = value(await importMarkdown(reg, { files, existing: 'overwrite' }, allow));
    expect(overwritten).toMatchObject({ created: 0, updated: 1 });
    expect(value(await getPage(reg, page.id)).content).toBe('Original');
  });

  it('makes pages from plain markdown under a page, with folders as the tree and missing images noted', async () => {
    const holder = value(await createPage(reg, { title: 'Import vault' }));
    const enc = new TextEncoder();
    const files: ImportFile[] = [
      { path: 'Vault/Guide.md', bytes: enc.encode('# Guide\n\nRead [setup](Guide/Setup.md).\n\n![shot](img/shot.png)') },
      { path: 'Vault/Guide/Setup.md', bytes: enc.encode('Install it. ![gone](missing.png)') },
      { path: 'Vault/img/shot.png', bytes: new Uint8Array(Buffer.from(PNG, 'base64')) }
    ];
    const result = value(await importMarkdown(reg, { files, under: { type: 'PAGE', id: holder.id } }, allow));
    expect(result).toMatchObject({ created: 2, images: 1, imagesMissing: ['Vault/Guide/missing.png'] });
    const [guide, setup] = result.items;
    const guidePage = value(await getPage(reg, guide!.id));
    expect(guidePage.parentId).toBe(holder.id);
    expect(guidePage.content).toContain(`[setup](/app/wiki/${setup!.id})`);
    expect(guidePage.content).toContain('storage://pages/');
    expect(guidePage.content.startsWith('# Guide')).toBe(false);
    expect(value(await getPage(reg, setup!.id)).content).toContain('*Image lost: gone. Paste it again.*');
  });

  it('refuses before writing when there is nothing to import or nowhere to put it', async () => {
    const none = await importMarkdown(reg, { files: [{ path: 'a.txt', bytes: new Uint8Array() }] }, allow);
    expect(!none.ok && none.error.message).toContain('No markdown files');
    const before = await reg.prisma.page.count();
    const nowhere = await importMarkdown(reg, { files: [{ path: 'a.md', bytes: new TextEncoder().encode('x') }], under: { type: 'PAGE', id: 'missing' } }, allow);
    expect(nowhere.ok).toBe(false);
    expect(await reg.prisma.page.count()).toBe(before);
  });

  it('refuses drawings past what the license allows', async () => {
    const enc = new TextEncoder();
    const files = [{ path: 'd.md', bytes: enc.encode('---\nremry: 1\ntype: page\nid: "dd"\ntitle: "D"\nbodyType: drawing\n---\n~~~remry-drawing\n{"elements":[]}\n~~~\n') }];
    const refused = await importMarkdown(reg, { files }, { allowDrawings: async (n) => ({ ok: false as const, error: new Error(`no ${n}`) }) });
    expect(!refused.ok && refused.error.message).toBe('no 1');
  });
});
