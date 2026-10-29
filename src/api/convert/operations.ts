// entity.convert: turning a project, doc or note into a wiki page, and a page into a
// project, doc or note. The new item takes the old one's text and everything attached
// to it (notes, todos, links, tags, comments, relations); sub-projects and sub-pages
// convert with it; links to the old item elsewhere are rewritten; then the old one goes.
//
// It's several writes, not one transaction (creating a page or doc stores files too), so
// everything that could refuse is checked before the first write.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { RELATABLE_TYPES, type EntityType } from '$shared/types/enums';
import { docPath, entityPath } from '$shared/utils/entity';
import { ensureAttachable, ensureWritable } from '$api/_archive';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { loadOwner } from '$api/_owners';
import { findProjectNamed } from '$api/_duplicates';
import { resolveEntityLabel } from '$api/_entity-labels';
import { createPage, deletePage } from '$api/page/operations';
import { createProject } from '$api/project/operations';
import { addDoc, updateDoc, DOC_HOLDERS } from '$api/attached/doc/operations';
import { addNote } from '$api/attached/note/operations';
import { hasStoredImages, noteFromPage, pageMarkdown, projectPageContent, titleFromNote } from './content';
import { rehomeAttachments, relinkMentions, type Ref } from './rehome';

type Reg = Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>;

export const CONVERT_FROM = ['PROJECT', 'DOC', 'NOTE', 'PAGE'] as const;
export const CONVERT_TO = ['PAGE', 'PROJECT', 'DOC', 'NOTE'] as const;
export type ConvertFrom = (typeof CONVERT_FROM)[number];
export type ConvertTo = (typeof CONVERT_TO)[number];

export interface ConvertInput {
  readonly entityType: ConvertFrom;
  readonly id: string;
  readonly to: ConvertTo;
  /** The page (to PAGE) or project (to PROJECT) to put it under. */
  readonly parentId?: string;
  /** What a doc or note goes on (to DOC or NOTE). */
  readonly onType?: EntityType;
  readonly onId?: string;
  /** A note's page title (default: its first line). */
  readonly title?: string;
  /** To PROJECT: the brief, status and owner of the new project. */
  readonly description?: string;
  readonly status?: string;
  readonly ownerType?: 'PERSON' | 'GROUP';
  readonly ownerId?: string;
  /** To PROJECT: create it even though a project has its name. */
  readonly allowDuplicate?: boolean;
  /** To PAGE: convert docs with an attached PDF anyway, deleting the PDF (a page can't hold one). */
  readonly dropPdfs?: boolean;
}

export interface ConvertedItem {
  readonly entityType: EntityType;
  readonly id: string;
  readonly title: string;
  readonly path: string;
}

export interface ConvertResult extends ConvertedItem {
  /** Everything made, the item first, then its sub-pages, sub-projects or docs. */
  readonly created: readonly ConvertedItem[];
  /** How many pages, docs, notes and reports had their links to the old item rewritten. */
  readonly relinked: number;
  readonly warnings: readonly string[];
}

interface Run {
  readonly created: ConvertedItem[];
  readonly warnings: string[];
  relinked: number;
}

const RELATABLE: ReadonlySet<string> = new Set(RELATABLE_TYPES);

/** A related link from where the item was to what it became, so the move is still visible. */
const relateToFormerHolder = async (reg: Pick<Registry, 'prisma'>, holder: Ref, to: Ref): Promise<void> => {
  if (!RELATABLE.has(holder.entityType)) return;
  if (holder.entityType === to.entityType && holder.entityId === to.entityId) return;
  // A relation the old item had with its holder has already moved over.
  const existing = await reg.prisma.relation.findFirst({
    where: {
      kind: 'RELATED',
      OR: [
        { fromType: holder.entityType, fromId: holder.entityId, toType: to.entityType, toId: to.entityId },
        { fromType: to.entityType, fromId: to.entityId, toType: holder.entityType, toId: holder.entityId }
      ]
    },
    select: { id: true }
  });
  if (existing) return;
  await reg.prisma.relation.create({
    data: { fromType: holder.entityType, fromId: holder.entityId, toType: to.entityType, toId: to.entityId, kind: 'RELATED' }
  });
};

const finish = (run: Run): Result<ConvertResult> => {
  const [first] = run.created;
  if (!first) return err(new Error('Nothing was converted'));
  return ok({ ...first, created: run.created, relinked: run.relinked, warnings: run.warnings });
};

// ----- Checks before anything is written -----

interface ProjectNode {
  readonly id: string;
  readonly name: string;
  readonly children: readonly ProjectNode[];
}

const loadProjectTree = async (reg: Pick<Registry, 'prisma'>, id: string): Promise<ProjectNode | null> => {
  const row = await reg.prisma.project.findUnique({ where: { id }, select: { id: true, name: true, children: { select: { id: true } } } });
  if (!row) return null;
  const children = await Promise.all(row.children.map((c) => loadProjectTree(reg, c.id)));
  return { id: row.id, name: row.name, children: children.filter((c): c is ProjectNode => c !== null) };
};

const flattenProjects = (node: ProjectNode): readonly ProjectNode[] => [node, ...node.children.flatMap(flattenProjects)];

interface PageNode {
  readonly id: string;
  readonly title: string;
  readonly children: readonly PageNode[];
}

const loadPageTree = async (reg: Pick<Registry, 'prisma'>, id: string): Promise<PageNode | null> => {
  const row = await reg.prisma.page.findUnique({ where: { id }, select: { id: true, title: true, children: { select: { id: true } } } });
  if (!row) return null;
  const children = await Promise.all(row.children.map((c) => loadPageTree(reg, c.id)));
  return { id: row.id, title: row.title, children: children.filter((c): c is PageNode => c !== null) };
};

const flattenPages = (node: PageNode): readonly PageNode[] => [node, ...node.children.flatMap(flattenPages)];

const sameName = (a: string, b: string): boolean => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

// ----- Doc → page -----

/** Deletes a converted doc's row and folder, without the archive check (its holder may be an archived sub-project). */
const deleteDocRow = async (reg: Reg, id: string, sourceUrl: string | null): Promise<void> => {
  const cleanup = await planEntityCleanup(reg, 'DOC', id);
  await reg.prisma.$transaction([...cleanup.ops, reg.prisma.doc.delete({ where: { id } })]);
  await removeFiles(reg, { ...cleanup, files: sourceUrl ? [sourceUrl, ...cleanup.files] : cleanup.files });
};

const docToPage = async (
  reg: Reg,
  run: Run,
  docId: string,
  placement: { readonly parentId?: string; readonly sortOrder?: number; readonly relate: boolean }
): Promise<Result<ConvertedItem>> => {
  const doc = await reg.prisma.doc.findUnique({ where: { id: docId } });
  if (!doc) return err(new Error(`Doc ${docId} not found`));
  // Its images are copied into the page's folder as it's created.
  const page = await createPage(reg, { title: doc.title, content: doc.content, parentId: placement.parentId });
  if (!page.ok) return err(page.error);
  const item: ConvertedItem = { entityType: 'PAGE', id: page.value.id, title: doc.title, path: page.value.path };
  run.created.push(item);
  await reg.prisma.page.update({
    where: { id: page.value.id },
    data: { prompt: doc.prompt, ...(placement.sortOrder !== undefined && { sortOrder: placement.sortOrder }) }
  });
  const to = { entityType: 'PAGE', entityId: page.value.id };
  await rehomeAttachments(reg, { entityType: 'DOC', entityId: doc.id }, to);
  if (placement.relate) await relateToFormerHolder(reg, { entityType: doc.entityType, entityId: doc.entityId }, to);
  if (doc.sourceUrl) run.warnings.push(`"${doc.title}" had an attached PDF, which was deleted: a wiki page can't hold one.`);
  await deleteDocRow(reg, doc.id, doc.sourceUrl);
  return ok(item);
};

// ----- Project → page -----

const projectToPage = async (reg: Reg, run: Run, projectId: string, parentId: string | undefined, sortOrder?: number): Promise<Result<string>> => {
  const project = await reg.prisma.project.findUnique({
    where: { id: projectId },
    include: {
      children: { select: { id: true }, orderBy: { name: 'asc' } },
      goals: { select: { goal: { select: { id: true, title: true } } } }
    }
  });
  if (!project) return err(new Error(`Project ${projectId} not found`));
  const owner = await loadOwner(reg, project.ownerType, project.ownerId);
  const content = projectPageContent({
    ...project,
    owner: owner?.label ? { label: owner.label, path: owner.path } : null,
    goals: project.goals.map(({ goal }) => ({ label: goal.title, path: entityPath('GOAL', goal.id) }))
  });

  const page = await createPage(reg, { title: project.name, content, parentId });
  if (!page.ok) return err(page.error);
  run.created.push({ entityType: 'PAGE', id: page.value.id, title: project.name, path: page.value.path });
  if (sortOrder !== undefined) await reg.prisma.page.update({ where: { id: page.value.id }, data: { sortOrder } });

  // Sub-projects first, then the project's docs, as sub-pages in that order.
  let order = 0;
  for (const child of project.children) {
    const converted = await projectToPage(reg, run, child.id, page.value.id, order++);
    if (!converted.ok) return converted;
  }
  const docs = await reg.prisma.doc.findMany({ where: { entityType: 'PROJECT', entityId: project.id }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
  for (const doc of docs) {
    const converted = await docToPage(reg, run, doc.id, { parentId: page.value.id, sortOrder: order++, relate: false });
    if (!converted.ok) return err(converted.error);
  }

  const from = { entityType: 'PROJECT', entityId: project.id };
  await rehomeAttachments(reg, from, { entityType: 'PAGE', entityId: page.value.id });
  run.relinked += await relinkMentions(reg, from, entityPath('PROJECT', project.id), page.value.path);

  const cleanup = await planEntityCleanup(reg, 'PROJECT', project.id);
  await reg.prisma.$transaction([
    reg.prisma.goalProject.deleteMany({ where: { projectId: project.id } }),
    ...cleanup.ops,
    reg.prisma.project.delete({ where: { id: project.id } })
  ]);
  await removeFiles(reg, cleanup);
  if (project.archivedAt) await reg.prisma.page.update({ where: { id: page.value.id }, data: { archivedAt: project.archivedAt } });
  return ok(page.value.id);
};

const checkPageParent = async (reg: Pick<Registry, 'prisma'>, parentId: string | undefined): Promise<Result<void>> => {
  if (!parentId) return ok(undefined);
  const parent = await reg.prisma.page.findUnique({ where: { id: parentId }, select: { id: true } });
  return parent ? ensureWritable(reg, 'PAGE', parentId) : err(new Error(`Page ${parentId} not found. Find the parent's id with page.list.`));
};

const convertProjectToPage = async (reg: Reg, input: ConvertInput): Promise<Result<ConvertResult>> => {
  const tree = await loadProjectTree(reg, input.id);
  if (!tree) return err(new Error(`Project ${input.id} not found. Find its id with project.list.`));
  const writable = await ensureWritable(reg, 'PROJECT', input.id);
  if (!writable.ok) return err(writable.error);
  const parent = await checkPageParent(reg, input.parentId);
  if (!parent.ok) return err(parent.error);
  if (!input.dropPdfs) {
    const ids = flattenProjects(tree).map((p) => p.id);
    const withPdf = await reg.prisma.doc.findMany({ where: { entityType: 'PROJECT', entityId: { in: ids }, sourceUrl: { not: null } }, select: { title: true } });
    if (withPdf.length > 0) {
      return err(new Error(
        `${withPdf.map((d) => `"${d.title}"`).join(', ')} ${withPdf.length === 1 ? 'has' : 'have'} an attached PDF, which a wiki page can't hold. ` +
        'Move those docs to another entity first (doc.update --entityType --entityId), or pass dropPdfs: true to delete the PDFs and keep their text.'
      ));
    }
  }
  const run: Run = { created: [], warnings: [], relinked: 0 };
  const converted = await projectToPage(reg, run, input.id, input.parentId);
  return converted.ok ? finish(run) : err(converted.error);
};

// ----- Doc or note → page -----

const convertDocToPage = async (reg: Reg, input: ConvertInput): Promise<Result<ConvertResult>> => {
  const doc = await reg.prisma.doc.findUnique({ where: { id: input.id }, select: { entityType: true, entityId: true, sourceUrl: true, title: true } });
  if (!doc) return err(new Error(`Doc ${input.id} not found. Find its id with doc.list.`));
  const writable = await ensureWritable(reg, doc.entityType, doc.entityId);
  if (!writable.ok) return err(writable.error);
  const parent = await checkPageParent(reg, input.parentId);
  if (!parent.ok) return err(parent.error);
  if (doc.sourceUrl && !input.dropPdfs) {
    return err(new Error(`"${doc.title}" has an attached PDF, which a wiki page can't hold. Keep it as a doc, or pass dropPdfs: true to delete the PDF and keep its text.`));
  }
  const run: Run = { created: [], warnings: [], relinked: 0 };
  const converted = await docToPage(reg, run, input.id, { parentId: input.parentId, relate: true });
  return converted.ok ? finish(run) : err(converted.error);
};

/** A note and all its replies, at any depth. */
const replyIds = async (reg: Pick<Registry, 'prisma'>, noteId: string): Promise<readonly string[]> => {
  const ids: string[] = [];
  let frontier = [noteId];
  while (frontier.length > 0) {
    const rows = await reg.prisma.note.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    frontier = rows.map((r) => r.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
};

const convertNoteToPage = async (reg: Reg, input: ConvertInput): Promise<Result<ConvertResult>> => {
  const note = await reg.prisma.note.findUnique({ where: { id: input.id } });
  if (!note) return err(new Error(`Note ${input.id} not found. Find its id with note.list.`));
  const writable = await ensureWritable(reg, note.entityType, note.entityId);
  if (!writable.ok) return err(writable.error);
  const parent = await checkPageParent(reg, input.parentId);
  if (!parent.ok) return err(parent.error);

  const title = input.title?.trim() || titleFromNote(note.content);
  const page = await createPage(reg, { title, content: note.content, parentId: input.parentId });
  if (!page.ok) return err(page.error);
  const to = { entityType: 'PAGE', entityId: page.value.id };

  // Its replies become notes on the page, keeping their threads below the first level.
  const replies = await replyIds(reg, note.id);
  await reg.prisma.$transaction([
    reg.prisma.note.updateMany({ where: { id: { in: [...replies] } }, data: to }),
    reg.prisma.note.updateMany({ where: { parentId: note.id }, data: { parentId: null } })
  ]);
  await rehomeAttachments(reg, { entityType: 'NOTE', entityId: note.id }, to);
  await relateToFormerHolder(reg, { entityType: note.entityType, entityId: note.entityId }, to);

  const cleanup = await planEntityCleanup(reg, 'NOTE', note.id);
  await reg.prisma.$transaction([...cleanup.ops, reg.prisma.note.delete({ where: { id: note.id } })]);
  await removeFiles(reg, cleanup);
  return finish({ created: [{ entityType: 'PAGE', id: page.value.id, title, path: page.value.path }], warnings: [], relinked: 0 });
};

// ----- Page → project -----

const pageToProject = async (
  reg: Reg,
  run: Run,
  pageId: string,
  project: { readonly parentId?: string; readonly description?: string; readonly status?: string; readonly ownerType?: 'PERSON' | 'GROUP'; readonly ownerId?: string }
): Promise<Result<string>> => {
  const page = await reg.prisma.page.findUnique({ where: { id: pageId }, include: { children: { select: { id: true }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] } } });
  if (!page) return err(new Error(`Page ${pageId} not found`));
  const created = await createProject(reg, { ...project, name: page.title, allowDuplicate: true });
  if (!created.ok) return err(created.error);
  run.created.push({ entityType: 'PROJECT', id: created.value.id, title: page.title, path: created.value.path });
  const holder = { entityType: 'PROJECT', entityId: created.value.id };

  // Its text becomes a doc of the same name; a sync page becomes a sync doc, with its sources.
  const markdown = pageMarkdown(page.bodyType, page.content);
  let docId: string | null = null;
  if (markdown.trim() !== '' || page.prompt) {
    const doc = await addDoc(reg, 'PROJECT', created.value.id, { title: page.title });
    if (!doc.ok) return err(doc.error);
    docId = doc.value.id;
    const filled = await updateDoc(reg, docId, { content: markdown, prompt: page.prompt });
    if (!filled.ok) return err(filled.error);
    run.created.push({ entityType: 'DOC', id: docId, title: page.title, path: docPath('PROJECT', created.value.id, docId) });
  }

  for (const child of page.children) {
    const converted = await pageToProject(reg, run, child.id, { parentId: created.value.id });
    if (!converted.ok) return converted;
  }

  const from = { entityType: 'PAGE', entityId: page.id };
  if (page.prompt && docId) {
    await reg.prisma.link.updateMany({ where: { entityType: 'PAGE', entityId: page.id }, data: { entityType: 'DOC', entityId: docId } });
  }
  await rehomeAttachments(reg, from, holder, { links: !(page.prompt && docId) });
  run.relinked += await relinkMentions(reg, from, entityPath('PAGE', page.id), created.value.path);
  const deleted = await deletePage(reg, page.id);
  if (!deleted.ok) return err(deleted.error);
  if (page.archivedAt) await reg.prisma.project.update({ where: { id: created.value.id }, data: { archivedAt: page.archivedAt } });
  return ok(created.value.id);
};

const convertPageToProject = async (reg: Reg, input: ConvertInput): Promise<Result<ConvertResult>> => {
  const tree = await loadPageTree(reg, input.id);
  if (!tree) return err(new Error(`Page ${input.id} not found. Find its id with page.list.`));
  const writable = await ensureWritable(reg, 'PAGE', input.id);
  if (!writable.ok) return err(writable.error);
  if (input.parentId) {
    const parent = await reg.prisma.project.findUnique({ where: { id: input.parentId }, select: { id: true } });
    if (!parent) return err(new Error(`Project ${input.parentId} not found. Find the parent's id with project.list.`));
    const parentWritable = await ensureWritable(reg, 'PROJECT', input.parentId);
    if (!parentWritable.ok) return err(parentWritable.error);
  }
  if (input.ownerType || input.ownerId) {
    if (!input.ownerType || !input.ownerId) return err(new Error('Set ownerType and ownerId together.'));
    if ((await resolveEntityLabel(reg, input.ownerType, input.ownerId)) === null) return err(new Error(`${input.ownerType} ${input.ownerId} not found`));
  }
  if (!input.allowDuplicate) {
    const titles = flattenPages(tree).map((p) => p.title);
    const clashes: string[] = [];
    for (const [i, title] of titles.entries()) {
      const existing = await findProjectNamed(reg, title);
      if (existing) clashes.push(`"${title}" (a project already, ${existing.id})`);
      else if (titles.slice(0, i).some((t) => sameName(t, title))) clashes.push(`"${title}" (twice among these pages)`);
    }
    if (clashes.length > 0) {
      return err(new Error(`Converting would make projects with names already in use: ${clashes.join(', ')}. Rename the pages first (page.update --title), or pass allowDuplicate: true if they're different projects.`));
    }
  }
  const run: Run = { created: [], warnings: [], relinked: 0 };
  const converted = await pageToProject(reg, run, input.id, {
    parentId: input.parentId,
    description: input.description,
    status: input.status,
    ownerType: input.ownerType,
    ownerId: input.ownerId
  });
  return converted.ok ? finish(run) : err(converted.error);
};

// ----- Page → doc or note -----

interface LeafPage {
  readonly id: string;
  readonly title: string;
  readonly bodyType: string;
  readonly content: string;
  readonly prompt: string | null;
}

const checkLeafPage = async (reg: Pick<Registry, 'prisma'>, id: string, to: string): Promise<Result<LeafPage>> => {
  const page = await reg.prisma.page.findUnique({ where: { id }, include: { _count: { select: { children: true } } } });
  if (!page) return err(new Error(`Page ${id} not found. Find its id with page.list.`));
  if (page._count.children > 0) {
    return err(new Error(`"${page.title}" has ${page._count.children} sub-page${page._count.children === 1 ? '' : 's'}, which a ${to} can't hold. Move or convert them first (page.update --parentId), or convert the page to a PROJECT, whose sub-projects they'd become.`));
  }
  const writable = await ensureWritable(reg, 'PAGE', id);
  return writable.ok ? ok(page) : err(writable.error);
};

const checkHolder = async (reg: Pick<Registry, 'prisma'>, input: ConvertInput): Promise<Result<Ref>> => {
  if (!input.onType || !input.onId) {
    return err(new Error(`Say what the ${input.to.toLowerCase()} goes on: onType and onId (a person, group, project or goal).`));
  }
  if (input.to === 'DOC' && !DOC_HOLDERS.includes(input.onType)) {
    return err(new Error(`A doc goes on a person, group, project or goal, not a ${input.onType.toLowerCase()}.`));
  }
  const attachable = await ensureAttachable(reg, input.onType, input.onId);
  return attachable.ok ? ok({ entityType: input.onType, entityId: input.onId }) : err(attachable.error);
};

const convertPageToDoc = async (reg: Reg, input: ConvertInput): Promise<Result<ConvertResult>> => {
  const page = await checkLeafPage(reg, input.id, 'doc');
  if (!page.ok) return err(page.error);
  const holder = await checkHolder(reg, input);
  if (!holder.ok) return err(holder.error);
  const on = holder.value.entityType as EntityType;

  const doc = await addDoc(reg, on, holder.value.entityId, { title: page.value.title });
  if (!doc.ok) return err(doc.error);
  // Its images are copied into the doc's folder as the text is saved.
  const filled = await updateDoc(reg, doc.value.id, { content: pageMarkdown(page.value.bodyType, page.value.content), prompt: page.value.prompt });
  if (!filled.ok) return err(filled.error);
  const path = docPath(on, holder.value.entityId, doc.value.id);

  const from = { entityType: 'PAGE', entityId: page.value.id };
  await rehomeAttachments(reg, from, { entityType: 'DOC', entityId: doc.value.id });
  const relinked = await relinkMentions(reg, from, entityPath('PAGE', page.value.id), path);
  const deleted = await deletePage(reg, page.value.id);
  if (!deleted.ok) return err(deleted.error);
  return finish({ created: [{ entityType: 'DOC', id: doc.value.id, title: page.value.title, path }], relinked, warnings: [] });
};

const convertPageToNote = async (reg: Reg, input: ConvertInput): Promise<Result<ConvertResult>> => {
  const page = await checkLeafPage(reg, input.id, 'note');
  if (!page.ok) return err(page.error);
  if (hasStoredImages(page.value.content)) {
    return err(new Error(`"${page.value.title}" shows images, which a note can't hold. Convert it to a DOC instead.`));
  }
  const holder = await checkHolder(reg, input);
  if (!holder.ok) return err(holder.error);
  const on = holder.value.entityType as EntityType;

  const note = await addNote(reg, on, holder.value.entityId, { content: noteFromPage(page.value.title, pageMarkdown(page.value.bodyType, page.value.content)) });
  if (!note.ok) return err(note.error);
  const path = entityPath(on, holder.value.entityId);

  // The page's notes become replies to the new note.
  const where = { entityType: 'PAGE', entityId: page.value.id };
  const onHolder = { entityType: on, entityId: holder.value.entityId };
  await reg.prisma.$transaction([
    reg.prisma.note.updateMany({ where: { ...where, parentId: null }, data: { ...onHolder, parentId: note.value.id } }),
    reg.prisma.note.updateMany({ where, data: onHolder })
  ]);
  const from = { entityType: 'PAGE', entityId: page.value.id };
  await rehomeAttachments(reg, from, { entityType: 'NOTE', entityId: note.value.id });
  const relinked = await relinkMentions(reg, from, entityPath('PAGE', page.value.id), path);
  const deleted = await deletePage(reg, page.value.id);
  if (!deleted.ok) return err(deleted.error);
  const warnings = page.value.prompt ? [`"${page.value.title}" was a sync page; a note has no prompt, so its prompt was dropped.`] : [];
  return finish({ created: [{ entityType: 'NOTE', id: note.value.id, title: page.value.title, path }], relinked, warnings });
};

// ----- Entry -----

const CONVERSIONS: Readonly<Partial<Record<`${ConvertFrom}>${ConvertTo}`, (reg: Reg, input: ConvertInput) => Promise<Result<ConvertResult>>>>> = {
  'PROJECT>PAGE': convertProjectToPage,
  'DOC>PAGE': convertDocToPage,
  'NOTE>PAGE': convertNoteToPage,
  'PAGE>PROJECT': convertPageToProject,
  'PAGE>DOC': convertPageToDoc,
  'PAGE>NOTE': convertPageToNote
};

export const convertEntity = async (reg: Reg, input: ConvertInput): Promise<Result<ConvertResult>> => {
  const convert = CONVERSIONS[`${input.entityType}>${input.to}`];
  if (!convert) {
    return err(new Error(
      `A ${input.entityType.toLowerCase()} can't be converted to a ${input.to.toLowerCase()}. ` +
      'entity.convert turns a project, doc or note into a wiki page (to PAGE), and a page into a project, doc or note. ' +
      'To move a doc to another entity, use doc.update --entityType --entityId.'
    ));
  }
  return convert(reg, input);
};
