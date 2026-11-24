// `entity.import`: makes pages, projects and docs from markdown files or a .zip (a Remry
// markdown export, or any folder of markdown), stores the images they show, and points
// their links at each other (`plan.ts` says how). It's several writes, not one transaction
// (pages and docs store files), so what could refuse the whole import is checked first: no
// markdown, a missing or archived place to put it, drawings past the free ones. After that,
// an item that can't be made or saved is reported in `problems` and the rest go on.
//
// An item exported from Remry keeps its id in its front matter. When that id is already in
// this notebook, `existing: skip` (the default) leaves it as it is and puts what's under it
// beneath it; `overwrite` replaces its title and text (a project's name, status and brief).

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils/result';
import type { BodyType } from '$shared/types/body-types';
import type { ImportExisting, ImportProblem, ImportResult, ImportUnderType, ImportedItem, ImportedKind } from '$shared/types/import';
import { docPath, entityPath } from '$shared/utils/entity';
import type { EntityType } from '$shared/types/enums';
import { ensureAttachable, ensureWritable } from '$api/_archive';
import { inBatches } from '$api/_entity-cleanup';
import { storeEditorImage } from '$api/_images';
import { createPage, updatePage } from '$api/page/operations';
import { createProject, updateProject } from '$api/project/operations';
import { addDoc, updateDoc } from '$api/attached/doc/operations';
import { importImagesIn, planImport, rewriteImportedText, type ImportFile, type PlannedItem } from './plan';

export interface ImportInput {
  readonly files: readonly ImportFile[];
  /** Where items with no imported parent go: under a page or project, or (docs) on any doc holder. */
  readonly under?: { readonly type: ImportUnderType; readonly id: string } | null;
  readonly existing?: ImportExisting;
}

export interface ImportOptions {
  /** Refuses this many new drawings when they'd pass the free ones (the route's license check). */
  readonly allowDrawings: (count: number) => Promise<Result<void>>;
  /** Claude's tools write sync docs and pages (`surface: tool`); the app doesn't. */
  readonly fromSync?: boolean;
}

type Reg = Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>;

interface Holder {
  readonly type: EntityType;
  readonly id: string;
}

interface Existing {
  readonly kind: ImportedKind;
  readonly id: string;
  readonly title: string;
  readonly bodyType: BodyType | null;
  readonly path: string;
}

/** Where an item goes, worked out before anything is written. */
interface Placement {
  readonly item: PlannedItem;
  /** A doc with nothing to hang on becomes a page. */
  readonly kind: ImportedKind;
  readonly existing: Existing | null;
  readonly action: 'create' | 'update' | 'skip';
  /** Its imported parent, when it goes under one. */
  readonly parentKey: string | null;
  /** Otherwise, the import's `under` (or null: top level). */
  readonly underParent: Holder | null;
}

const DOC_HOLDER_TYPES: readonly string[] = ['PERSON', 'GROUP', 'PROJECT', 'GOAL'];

const findExisting = async (reg: Pick<Registry, 'prisma'>, items: readonly PlannedItem[]): Promise<Map<string, Existing>> => {
  const found = new Map<string, Existing>();
  const idsOf = (kind: ImportedKind): string[] => items.flatMap((i) => (i.kind === kind && i.remryId ? [i.remryId] : []));
  for (const batch of inBatches(idsOf('PAGE'))) {
    for (const row of await reg.prisma.page.findMany({ where: { id: { in: batch } }, select: { id: true, title: true, bodyType: true } })) {
      found.set(row.id, { kind: 'PAGE', id: row.id, title: row.title, bodyType: row.bodyType as BodyType, path: entityPath('PAGE', row.id) });
    }
  }
  for (const batch of inBatches(idsOf('PROJECT'))) {
    for (const row of await reg.prisma.project.findMany({ where: { id: { in: batch } }, select: { id: true, name: true } })) {
      found.set(row.id, { kind: 'PROJECT', id: row.id, title: row.name, bodyType: null, path: entityPath('PROJECT', row.id) });
    }
  }
  for (const batch of inBatches(idsOf('DOC'))) {
    for (const row of await reg.prisma.doc.findMany({ where: { id: { in: batch } }, select: { id: true, title: true, bodyType: true, entityType: true, entityId: true } })) {
      found.set(row.id, { kind: 'DOC', id: row.id, title: row.title, bodyType: row.bodyType as BodyType, path: docPath(row.entityType as EntityType, row.entityId, row.id) });
    }
  }
  return found;
};

const checkUnder = async (reg: Pick<Registry, 'prisma'>, under: ImportInput['under']): Promise<Result<void>> => {
  if (!under) return ok(undefined);
  if (under.type === 'PAGE' || under.type === 'PROJECT') {
    const row = under.type === 'PAGE'
      ? await reg.prisma.page.findUnique({ where: { id: under.id }, select: { id: true } })
      : await reg.prisma.project.findUnique({ where: { id: under.id }, select: { id: true } });
    if (!row) return err(new Error(`${under.type === 'PAGE' ? 'Page' : 'Project'} ${under.id} not found: import somewhere that exists, or leave out where to put it.`));
    return ensureWritable(reg, under.type, under.id);
  }
  return ensureAttachable(reg, under.type, under.id);
};

/** Where each item goes, top down (pure apart from what it's given). */
export const placeItems = (
  items: readonly PlannedItem[],
  existing: ReadonlyMap<string, Existing>,
  under: ImportInput['under'],
  mode: ImportExisting
): readonly Placement[] => {
  const placed = new Map<string, Placement>();
  const result: Placement[] = [];
  for (const item of items) {
    const found = item.remryId ? existing.get(item.remryId) : undefined;
    const match = found && found.kind === item.kind ? found : null;
    const parent = item.parentKey ? placed.get(item.parentKey) ?? null : null;
    const parentKind = parent?.kind ?? null;

    let kind: ImportedKind = item.kind;
    let parentKey: string | null = null;
    let underParent: Holder | null = null;
    if (kind === 'DOC') {
      if (parentKind === 'PROJECT') parentKey = parent!.item.key;
      else if (under && DOC_HOLDER_TYPES.includes(under.type)) underParent = { type: under.type, id: under.id };
      else if (!match) kind = 'PAGE';
    }
    if (kind === 'PAGE') {
      if (parentKind === 'PAGE') parentKey = parent!.item.key;
      else if (under?.type === 'PAGE') underParent = { type: 'PAGE', id: under.id };
    }
    if (kind === 'PROJECT') {
      if (parentKind === 'PROJECT') parentKey = parent!.item.key;
      else if (under?.type === 'PROJECT') underParent = { type: 'PROJECT', id: under.id };
    }

    const action = match && kind === match.kind ? (mode === 'overwrite' ? 'update' : 'skip') : 'create';
    const placement: Placement = { item, kind, existing: action === 'create' ? null : match, action, parentKey, underParent };
    placed.set(item.key, placement);
    result.push(placement);
  }
  return result;
};

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

interface Made {
  readonly kind: ImportedKind;
  readonly id: string;
  readonly path: string;
}

export const importMarkdown = async (reg: Reg, input: ImportInput, options: ImportOptions): Promise<Result<ImportResult>> => {
  const plan = planImport(input.files);
  if (plan.items.length === 0) {
    return err(new Error('No markdown files to import. Send a Remry markdown export (.zip), or .md files with their images.'));
  }
  const under = await checkUnder(reg, input.under);
  if (!under.ok) return err(under.error);

  const existing = await findExisting(reg, plan.items);
  const placements = placeItems(plan.items, existing, input.under, input.existing ?? 'skip');
  const drawings = placements.filter((p) => p.action === 'create' && p.item.bodyType === 'drawing' && p.kind !== 'PROJECT').length;
  const allowed = await options.allowDrawings(drawings);
  if (!allowed.ok) return err(allowed.error);

  const problems: ImportProblem[] = [];
  const made = new Map<string, Made>();
  const items: ImportedItem[] = [];
  const fromSync = { fromSync: options.fromSync ?? false };

  // Make each item, empty, parents first.
  for (const p of placements) {
    const { item } = p;
    if (p.existing) {
      made.set(item.key, { kind: p.existing.kind, id: p.existing.id, path: p.existing.path });
      continue;
    }
    const parent = p.parentKey ? made.get(p.parentKey) : null;
    if (p.parentKey && !parent) {
      problems.push({ file: item.file, message: `"${item.title}" wasn't imported, since what it goes under couldn't be.` });
      continue;
    }
    const parentId = parent?.id ?? p.underParent?.id;
    const bodyType: BodyType = p.kind === 'PROJECT' ? 'doc' : item.bodyType;
    if (p.kind === 'PAGE') {
      const page = await createPage(reg, { title: item.title, bodyType, ...(parentId && { parentId }) });
      if (!page.ok) problems.push({ file: item.file, message: page.error.message });
      else made.set(item.key, { kind: 'PAGE', id: page.value.id, path: page.value.path });
    } else if (p.kind === 'PROJECT') {
      const base = { name: item.title, allowDuplicate: true, ...(parentId && { parentId }) };
      let project = await createProject(reg, { ...base, ...(item.status && { status: item.status }) });
      if (!project.ok && item.status) {
        problems.push({ file: item.file, message: `Its status "${item.status}" was left out: ${project.error.message}` });
        project = await createProject(reg, base);
      }
      if (!project.ok) problems.push({ file: item.file, message: project.error.message });
      else made.set(item.key, { kind: 'PROJECT', id: project.value.id, path: project.value.path });
    } else {
      const holder: Holder = parent ? { type: 'PROJECT', id: parent.id } : p.underParent!;
      const doc = await addDoc(reg, holder.type, holder.id, { title: item.title, bodyType });
      if (!doc.ok) problems.push({ file: item.file, message: doc.error.message });
      else made.set(item.key, { kind: 'DOC', id: doc.value.id, path: docPath(holder.type, holder.id, doc.value.id) });
    }
  }

  // Then each one's text: its images stored on it, its links pointed at the new items.
  const fileKeys = new Map(plan.items.map((i) => [i.file, i.key]));
  const idKeys = new Map(plan.items.flatMap((i) => (i.remryId ? [[i.remryId, i.key] as const] : [])));
  let storedCount = 0;
  const missing = new Set<string>();

  for (const p of placements) {
    const { item } = p;
    const target = made.get(item.key);
    if (!target) continue;
    const outcome: ImportedItem['outcome'] = p.action === 'skip' ? 'skipped' : p.action === 'update' ? 'updated' : 'created';
    items.push({ kind: target.kind, id: target.id, title: p.existing?.title && p.action === 'skip' ? p.existing.title : item.title, path: target.path, outcome, top: !p.parentKey });
    if (p.action === 'skip') continue;
    if (p.existing && p.existing.bodyType && p.existing.bodyType !== item.bodyType && target.kind !== 'PROJECT') {
      problems.push({ file: item.file, message: `"${item.title}" is a ${p.existing.bodyType} here and a ${item.bodyType} in the import, so its text was left as it is.` });
      continue;
    }

    let text = item.body;
    if (item.bodyType === 'doc' || target.kind === 'PROJECT') {
      const stored = new Map<string, string>();
      // Projects hold no editor images: theirs become notes.
      if (target.kind !== 'PROJECT') {
        const folder = `${target.kind === 'PAGE' ? 'pages' : 'docs'}/${target.id}`;
        for (const path of importImagesIn(item.body, item.file, plan.images)) {
          const image = await storeEditorImage(reg, folder, toBase64(plan.images.get(path)!));
          if (image.ok) {
            stored.set(path, image.value.key);
            storedCount++;
          } else {
            problems.push({ file: path, message: image.error.message });
          }
        }
      }
      const rewritten = rewriteImportedText(item.body, item.file, {
        pathOf: (key) => made.get(key)?.path ?? null,
        keyForId: (id) => idKeys.get(id) ?? null,
        keyForFile: (path) => fileKeys.get(path) ?? null,
        storedImage: (path) => stored.get(path) ?? null
      });
      text = rewritten.text;
      for (const path of rewritten.missing) missing.add(path);
    }

    const update = p.action === 'update';
    if (!update && text.trim() === '') continue;
    const saved = target.kind === 'PAGE'
      ? await updatePage(reg, target.id, { content: text, ...(update && { title: item.title }) }, fromSync)
      : target.kind === 'DOC'
        ? await updateDoc(reg, target.id, { content: text, ...(update && { title: item.title }) }, fromSync)
        : await updateProject(reg, target.id, { description: text.trim() ? text : null, ...(update && { name: item.title, ...(item.status && { status: item.status }) }) });
    if (!saved.ok) problems.push({ file: item.file, message: `"${item.title}" was ${update ? 'found' : 'made'}, but its text couldn't be saved: ${saved.error.message}` });
  }

  return ok({
    items,
    created: items.filter((i) => i.outcome === 'created').length,
    updated: items.filter((i) => i.outcome === 'updated').length,
    skipped: items.filter((i) => i.outcome === 'skipped').length,
    images: storedCount,
    imagesMissing: [...missing],
    problems
  });
};
