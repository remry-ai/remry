// What a markdown export of a wiki page, a project or a doc can hold, with each body as
// stored (`ExportNode`, `$shared/types/export-tree`): a page and its sub-pages, a project
// with its docs (its sync doc first) and sub-projects, at any depth. Archived children are
// left out, as in the app's lists; the root is exported even if it's archived. App-only
// (`cli/api.ts`): Claude reads pages and docs with their own tools.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils/result';
import { asBodyType } from '$shared/types/body-types';
import type { ExportNode, ExportNodeKind } from '$shared/types/export-tree';
import { ACTIVE } from '$api/_archive';
import { inBatches } from '$api/_entity-cleanup';

interface PageRow {
  readonly id: string;
  readonly title: string;
  readonly bodyType: string;
  readonly content: string;
  readonly prompt: string | null;
  readonly parentId: string | null;
}

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string | null;
  readonly parentId: string | null;
}

interface DocRow {
  readonly id: string;
  readonly title: string;
  readonly bodyType: string;
  readonly content: string;
  readonly prompt: string | null;
  readonly entityId: string;
  readonly syncHolder: string | null;
}

const pageNode = (row: PageRow, children: readonly ExportNode[]): ExportNode => ({
  kind: 'PAGE', id: row.id, title: row.title, bodyType: asBodyType(row.bodyType), content: row.content, status: null, prompt: row.prompt, children
});

const docNode = (row: DocRow): ExportNode => ({
  kind: 'DOC', id: row.id, title: row.title, bodyType: asBodyType(row.bodyType), content: row.content, status: null, prompt: row.prompt, children: []
});

const projectNode = (row: ProjectRow, children: readonly ExportNode[]): ExportNode => ({
  kind: 'PROJECT', id: row.id, title: row.name, bodyType: 'doc', content: row.description ?? '', status: row.status, prompt: null, children
});

/** Groups rows by parent, keeping their order. */
const byParent = <T>(rows: readonly T[], parentOf: (row: T) => string | null): ReadonlyMap<string, readonly T[]> => {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const parent = parentOf(row);
    if (parent === null) continue;
    map.set(parent, [...(map.get(parent) ?? []), row]);
  }
  return map;
};

/** A page tree from its root and every page below it (any order within a parent is kept). Pure. */
export const buildPageTree = (root: PageRow, descendants: readonly PageRow[]): ExportNode => {
  const children = byParent(descendants, (r) => r.parentId);
  const seen = new Set<string>();
  const build = (row: PageRow): ExportNode => {
    seen.add(row.id);
    return pageNode(row, (children.get(row.id) ?? []).filter((c) => !seen.has(c.id)).map(build));
  };
  return build(root);
};

/** A project tree: each project's docs (the sync doc first), then its sub-projects. Pure. */
export const buildProjectTree = (root: ProjectRow, descendants: readonly ProjectRow[], docs: readonly DocRow[]): ExportNode => {
  const children = byParent(descendants, (r) => r.parentId);
  const docsOf = byParent(docs, (d) => d.entityId);
  const seen = new Set<string>();
  const build = (row: ProjectRow): ExportNode => {
    seen.add(row.id);
    const own = docsOf.get(row.id) ?? [];
    const ordered = [...own.filter((d) => d.syncHolder), ...own.filter((d) => !d.syncHolder)];
    return projectNode(row, [...ordered.map(docNode), ...(children.get(row.id) ?? []).filter((c) => !seen.has(c.id)).map(build)]);
  };
  return build(root);
};

const PAGE_FIELDS = { id: true, title: true, bodyType: true, content: true, prompt: true, parentId: true } as const;
const PROJECT_FIELDS = { id: true, name: true, description: true, status: true, parentId: true } as const;
const DOC_FIELDS = { id: true, title: true, bodyType: true, content: true, prompt: true, entityId: true, syncHolder: true } as const;

/** Every active row below the root, a level at a time. */
const descendantsOf = async <T extends { readonly id: string }>(
  rootId: string,
  findChildren: (parentIds: string[]) => Promise<readonly T[]>
): Promise<readonly T[]> => {
  const found: T[] = [];
  const seen = new Set([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const batch of inBatches(frontier)) {
      for (const row of await findChildren(batch)) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        found.push(row);
        next.push(row.id);
      }
    }
    frontier = next;
  }
  return found;
};

export const exportTree = async (
  reg: Pick<Registry, 'prisma'>,
  kind: ExportNodeKind,
  id: string
): Promise<Result<ExportNode>> => {
  const p = reg.prisma;
  if (kind === 'DOC') {
    const row = await p.doc.findUnique({ where: { id }, select: DOC_FIELDS });
    return row ? ok(docNode(row)) : err(new Error(`Doc ${id} not found`));
  }
  if (kind === 'PAGE') {
    const root = await p.page.findUnique({ where: { id }, select: PAGE_FIELDS });
    if (!root) return err(new Error(`Page ${id} not found`));
    const below = await descendantsOf(id, (ids) =>
      p.page.findMany({ where: { ...ACTIVE, parentId: { in: ids } }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], select: PAGE_FIELDS })
    );
    return ok(buildPageTree(root, below));
  }
  const root = await p.project.findUnique({ where: { id }, select: PROJECT_FIELDS });
  if (!root) return err(new Error(`Project ${id} not found`));
  const below = await descendantsOf(id, (ids) =>
    p.project.findMany({ where: { ...ACTIVE, parentId: { in: ids } }, orderBy: { name: 'asc' }, select: PROJECT_FIELDS })
  );
  const docs: DocRow[] = [];
  for (const batch of inBatches([id, ...below.map((r) => r.id)])) {
    docs.push(...(await p.doc.findMany({ where: { entityType: 'PROJECT', entityId: { in: batch } }, orderBy: { sortOrder: 'asc' }, select: DOC_FIELDS })));
  }
  return ok(buildProjectTree(root, below, docs));
};
