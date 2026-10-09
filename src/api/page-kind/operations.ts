// Page kinds are data: each notebook defines its own (a key, a name and typed
// fields) in page_kind, and GENERAL, with no fields, always exists. Changing a
// kind's fields never leaves a page holding a value its kind can't validate:
// removing a field drops its values, and a change that would orphan a value
// (a removed option in use, a changed input with values) is refused.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import {
  GENERAL_KIND,
  PAGE_KIND_KEY,
  PAGE_KIND_KEY_RULE,
  STARTER_KINDS,
  pageKindFieldsSchema,
  parsePageProperties,
  readPageKindFields,
  readPageProperties,
  type PageKindDefinition,
  type PageKindField,
  type PageKindSummary,
  type PageProperties
} from '$shared/types/pages';

// ----- Pure helpers -----

interface PageValues {
  readonly id: string;
  readonly title: string;
  readonly properties: PageProperties;
}

export interface FieldChangePlan {
  /** Keys of removed fields; their values are dropped from every page. */
  readonly removed: readonly string[];
  /** Pages that lose at least one value. */
  readonly pagesChanged: number;
}

const namePages = (pages: readonly PageValues[]): string => {
  const titles = pages.slice(0, 5).map((p) => `"${p.title}"`).join(', ');
  return pages.length > 5 ? `${titles} and ${pages.length - 5} more` : titles;
};

const choiceInputs = new Set(['select', 'multiselect']);

/** Checks a change of fields against the kind's pages. */
export const planFieldChange = (
  before: readonly PageKindField[],
  after: readonly PageKindField[],
  pages: readonly PageValues[]
): Result<FieldChangePlan> => {
  for (const old of before) {
    const next = after.find((f) => f.key === old.key);
    if (!next) continue;
    const using = pages.filter((p) => p.properties[old.key] !== undefined);
    const compatible = next.input === old.input || (choiceInputs.has(old.input) && next.input === 'multiselect');
    if (!compatible && using.length > 0) {
      return err(new Error(
        `${old.key} is a ${old.input} field and ${using.length} page(s) have a value (${namePages(using)}). ` +
        `Clear those values first, or add a new field instead of changing this one.`
      ));
    }
    if (next.options) {
      const kept = new Set(next.options);
      const orphaned = using.filter((p) => {
        const value = p.properties[old.key];
        return (Array.isArray(value) ? value : [String(value)]).some((v) => !kept.has(v));
      });
      if (orphaned.length > 0) {
        const missing = [...new Set(orphaned.flatMap((p) => {
          const value = p.properties[old.key];
          return (Array.isArray(value) ? value : [String(value)]).filter((v) => !kept.has(v));
        }))];
        return err(new Error(
          `${old.key} would lose the option(s) ${missing.join(', ')}, which ${orphaned.length} page(s) use (${namePages(orphaned)}). ` +
          `Change those pages first, or keep the option(s).`
        ));
      }
    }
  }
  const removed = before.filter((f) => !after.some((n) => n.key === f.key)).map((f) => f.key);
  const pagesChanged = pages.filter((p) => removed.some((key) => p.properties[key] !== undefined)).length;
  return ok({ removed, pagesChanged });
};

/**
 * The properties a page keeps when it moves to another kind (or its kind changes
 * shape): values whose key and value fit the new fields; the rest are dropped.
 * A select value fits a multiselect with that option.
 */
export const fitProperties = (fields: readonly PageKindField[], properties: PageProperties): PageProperties => {
  const kept: Record<string, PageProperties[string]> = {};
  for (const field of fields) {
    const value = properties[field.key];
    if (value === undefined) continue;
    const candidate = field.input === 'multiselect' && typeof value === 'string' ? [value] : value;
    if (parsePageProperties({ key: 'kind', fields: [field] }, { [field.key]: candidate }).ok) kept[field.key] = candidate;
  }
  return kept;
};

// ----- Rows -----

interface PageKindRow {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly fields: string;
  readonly sortOrder: number;
}

const toDefinition = (row: PageKindRow): PageKindDefinition => ({
  key: row.key,
  name: row.name,
  description: row.description,
  fields: readPageKindFields(row.fields),
  sortOrder: row.sortOrder
});

const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

const unknownKind = async (reg: Pick<Registry, 'prisma'>, key: string): Promise<Error> => {
  const rows = await reg.prisma.pageKind.findMany({ orderBy: ORDER, select: { key: true } });
  const keys = [GENERAL_KIND.key, ...rows.map((r) => r.key)];
  return new Error(`There is no page kind "${key}" in this notebook. Kinds: ${keys.join(', ')}. Create one with pageKind.create.`);
};

const loadPages = async (reg: Pick<Registry, 'prisma'>, kind: string): Promise<readonly PageValues[]> => {
  const rows = await reg.prisma.page.findMany({ where: { kind }, select: { id: true, title: true, properties: true } });
  return rows.map((r) => ({ id: r.id, title: r.title, properties: readPageProperties(r.properties) }));
};

// ----- Queries -----

export const listPageKinds = async (reg: Pick<Registry, 'prisma'>): Promise<Result<readonly PageKindSummary[]>> => {
  const [rows, counts] = await Promise.all([
    reg.prisma.pageKind.findMany({ orderBy: ORDER }),
    reg.prisma.page.groupBy({ by: ['kind'], _count: { _all: true } })
  ]);
  const count = (key: string): number => counts.find((c) => c.kind === key)?._count._all ?? 0;
  return ok([GENERAL_KIND, ...rows.map(toDefinition)].map((kind) => ({ ...kind, pageCount: count(kind.key) })));
};

/** A kind by key; GENERAL always exists. The error lists the notebook's kinds. */
export const getPageKind = async (reg: Pick<Registry, 'prisma'>, key: string): Promise<Result<PageKindDefinition>> => {
  if (key === GENERAL_KIND.key) return ok(GENERAL_KIND);
  const row = await reg.prisma.pageKind.findUnique({ where: { key } });
  return row ? ok(toDefinition(row)) : err(await unknownKind(reg, key));
};

// ----- Mutations -----

export interface CreatePageKindInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly fields?: readonly PageKindField[];
}

const checkName = async (reg: Pick<Registry, 'prisma'>, name: string, exceptKey?: string): Promise<Result<void>> => {
  const rows = await reg.prisma.pageKind.findMany({ select: { key: true, name: true } });
  const same = [{ key: GENERAL_KIND.key, name: GENERAL_KIND.name }, ...rows]
    .find((r) => r.key !== exceptKey && r.name.trim().toLowerCase() === name.trim().toLowerCase());
  return same ? err(new Error(`The kind ${same.key} is already called "${same.name}". Pick another name.`)) : ok(undefined);
};

const checkFields = (fields: unknown): Result<readonly PageKindField[]> => {
  const parsed = pageKindFieldsSchema.safeParse(fields);
  if (parsed.success) return ok(parsed.data as readonly PageKindField[]);
  return err(new Error(`fields: ${parsed.error.issues.map((i) => `${i.path.length ? `${i.path.join('.')} ` : ''}${i.message}`).join('; ')}`));
};

export const createPageKind = async (
  reg: Pick<Registry, 'prisma'>,
  input: CreatePageKindInput
): Promise<Result<PageKindDefinition>> => {
  if (!PAGE_KIND_KEY.test(input.key)) return err(new Error(`"${input.key}" can't be a kind key. Use ${PAGE_KIND_KEY_RULE}.`));
  if (input.key === GENERAL_KIND.key) return err(new Error('GENERAL is the built-in plain page kind. Pick another key.'));
  if (await reg.prisma.pageKind.findUnique({ where: { key: input.key }, select: { key: true } })) {
    return err(new Error(`There is already a kind ${input.key}. Change it with pageKind.update.`));
  }
  const name = await checkName(reg, input.name);
  if (!name.ok) return err(name.error);
  const fields = checkFields(input.fields ?? []);
  if (!fields.ok) return err(fields.error);

  const last = await reg.prisma.pageKind.aggregate({ _max: { sortOrder: true } });
  const row = await reg.prisma.pageKind.create({
    data: {
      key: input.key,
      name: input.name.trim(),
      description: input.description ?? null,
      fields: JSON.stringify(fields.value),
      sortOrder: (last._max.sortOrder ?? -1) + 1
    }
  });
  return ok(toDefinition(row));
};

export interface UpdatePageKindInput {
  readonly name?: string;
  readonly description?: string | null;
  /** The whole new field list. Fields are matched by key. */
  readonly fields?: readonly PageKindField[];
  readonly sortOrder?: number;
}

export const updatePageKind = async (
  reg: Pick<Registry, 'prisma'>,
  key: string,
  input: UpdatePageKindInput
): Promise<Result<PageKindDefinition & { readonly removedFields: readonly string[]; readonly pagesChanged: number }>> => {
  if (key === GENERAL_KIND.key) return err(new Error('GENERAL is the built-in plain page kind and can\'t be changed.'));
  const existing = await reg.prisma.pageKind.findUnique({ where: { key } });
  if (!existing) return err(await unknownKind(reg, key));

  if (input.name !== undefined) {
    const name = await checkName(reg, input.name, key);
    if (!name.ok) return err(name.error);
  }

  let plan: FieldChangePlan = { removed: [], pagesChanged: 0 };
  let pageWrites: { readonly id: string; readonly properties: string }[] = [];
  let fieldsJson: string | undefined;
  if (input.fields !== undefined) {
    const fields = checkFields(input.fields);
    if (!fields.ok) return err(fields.error);
    const pages = await loadPages(reg, key);
    const planned = planFieldChange(readPageKindFields(existing.fields), fields.value, pages);
    if (!planned.ok) return err(planned.error);
    plan = planned.value;
    pageWrites = pages
      .map((p) => ({ id: p.id, before: p.properties, after: fitProperties(fields.value, p.properties) }))
      .filter((p) => JSON.stringify(p.before) !== JSON.stringify(p.after))
      .map((p) => ({ id: p.id, properties: JSON.stringify(p.after) }));
    fieldsJson = JSON.stringify(fields.value);
  }

  const [row] = await reg.prisma.$transaction([
    reg.prisma.pageKind.update({
      where: { key },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(fieldsJson !== undefined && { fields: fieldsJson })
      }
    }),
    ...pageWrites.map((p) => reg.prisma.page.update({ where: { id: p.id }, data: { properties: p.properties } }))
  ]);
  return ok({ ...toDefinition(row), removedFields: plan.removed, pagesChanged: pageWrites.length });
};

/** Refuses while pages use the kind, unless `moveTo` names a kind to move them to. */
export const deletePageKind = async (
  reg: Pick<Registry, 'prisma'>,
  key: string,
  moveTo?: string
): Promise<Result<{ readonly deleted: true; readonly pagesMoved: number }>> => {
  if (key === GENERAL_KIND.key) return err(new Error('GENERAL is the built-in plain page kind and can\'t be deleted.'));
  if (!(await reg.prisma.pageKind.findUnique({ where: { key }, select: { key: true } }))) return err(await unknownKind(reg, key));
  const pages = await loadPages(reg, key);

  if (pages.length > 0 && moveTo === undefined) {
    return err(new Error(
      `${pages.length} page(s) are ${key} (${namePages(pages)}). Pass moveTo with another kind (GENERAL for plain pages) to move them first.`
    ));
  }
  if (moveTo === key) return err(new Error('moveTo must be a different kind'));
  let target: PageKindDefinition = GENERAL_KIND;
  if (moveTo !== undefined) {
    const found = await getPageKind(reg, moveTo);
    if (!found.ok) return err(found.error);
    target = found.value;
  }

  await reg.prisma.$transaction([
    ...pages.map((p) => reg.prisma.page.update({
      where: { id: p.id },
      data: { kind: target.key, properties: JSON.stringify(fitProperties(target.fields, p.properties)) }
    })),
    reg.prisma.pageKind.delete({ where: { key } })
  ]);
  return ok({ deleted: true as const, pagesMoved: pages.length });
};

/** Adds the work starter kinds a notebook doesn't have yet. */
export const addStarterKinds = async (reg: Pick<Registry, 'prisma'>): Promise<Result<readonly string[]>> => {
  const existing = new Set((await reg.prisma.pageKind.findMany({ select: { key: true } })).map((r) => r.key));
  const missing = STARTER_KINDS.filter((k) => !existing.has(k.key));
  for (const [i, kind] of missing.entries()) {
    await reg.prisma.pageKind.create({
      data: { key: kind.key, name: kind.name, description: kind.description, fields: JSON.stringify(kind.fields), sortOrder: existing.size + i }
    });
  }
  return ok(missing.map((k) => k.key));
};
