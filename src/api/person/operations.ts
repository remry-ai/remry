// People. The core keeps a name and an email; each module's fields (org: title
// and lead; personal: birthday and how you know them) live in its own table and
// are read and written through its person extension ($api/modules/person-extensions).

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { ArchiveFilter } from '$shared/types/enums';
import type { PersonDetail, PersonExtensionsPatch, PersonSummary } from '$shared/types/person';
import { entityPath } from '$shared/utils/entity';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { archiveWhere, ensureWritable } from '$api/_archive';
import { listPersonGroups } from '$api/group/operations';
import { ORG_PERSON, PERSONAL_PERSON } from '$api/modules/person-extensions';
import { relationsToPerson } from '$api/person-relation/operations';

type Reg = Pick<Registry, 'prisma'>;

const notFound = (id: string): Error => new Error(`Person ${id} not found. Find ids with person.list.`);

// ----- "Me" -----

/** Makes one person "me" (the notebook's owner), or nobody with null. */
export const setMe = async (reg: Reg, id: string | null): Promise<Result<{ readonly id: string | null }>> => {
  if (id !== null && !(await reg.prisma.person.findUnique({ where: { id }, select: { id: true } }))) return err(notFound(id));
  await reg.prisma.$transaction([
    reg.prisma.person.updateMany({ where: { isMe: true }, data: { isMe: false } }),
    ...(id !== null ? [reg.prisma.person.update({ where: { id }, data: { isMe: true } })] : [])
  ]);
  return ok({ id });
};

// ----- Queries -----

export const listPersons = async (reg: Reg, archived: ArchiveFilter = 'exclude'): Promise<Result<readonly PersonSummary[]>> => {
  const rows = await reg.prisma.person.findMany({ where: archiveWhere(archived), orderBy: { name: 'asc' } });
  const ids = rows.map((r) => r.id);
  const me = await reg.prisma.person.findFirst({ where: { isMe: true }, select: { id: true } });
  const [org, personal, toMe] = await Promise.all([ORG_PERSON.load(reg, ids), PERSONAL_PERSON.load(reg, ids), relationsToPerson(reg, me?.id ?? null)]);
  return ok(rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    isMe: r.isMe,
    toMe: toMe.get(r.id) ?? [],
    path: entityPath('PERSON', r.id),
    archivedAt: r.archivedAt,
    createdAt: r.createdAt,
    extensions: {
      ...(org.has(r.id) && { org: org.get(r.id)! }),
      ...(personal.has(r.id) && { personal: personal.get(r.id)! })
    }
  })));
};

export const getPerson = async (reg: Reg, id: string): Promise<Result<PersonDetail>> => {
  const row = await reg.prisma.person.findUnique({ where: { id } });
  if (!row) return err(notFound(id));
  const me = await reg.prisma.person.findFirst({ where: { isMe: true }, select: { id: true } });
  const [groups, org, personal, toMe] = await Promise.all([
    listPersonGroups(reg, id),
    ORG_PERSON.detail(reg, id),
    PERSONAL_PERSON.detail(reg, id),
    relationsToPerson(reg, me && me.id !== id ? me.id : null)
  ]);
  return ok({
    id: row.id,
    name: row.name,
    email: row.email,
    isMe: row.isMe,
    toMe: toMe.get(row.id) ?? [],
    path: entityPath('PERSON', row.id),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    groups,
    extensions: { ...(org && { org }), ...(personal && { personal }) }
  });
};

// ----- Mutations -----

const applyExtensions = async (reg: Reg, personId: string, patch: PersonExtensionsPatch | undefined): Promise<Result<void>> => {
  if (patch?.org) {
    const done = await ORG_PERSON.update(reg, personId, patch.org);
    if (!done.ok) return done;
  }
  if (patch?.personal) {
    const done = await PERSONAL_PERSON.update(reg, personId, patch.personal);
    if (!done.ok) return done;
  }
  return ok(undefined);
};

export interface CreatePersonInput {
  readonly name: string;
  readonly email?: string;
  readonly extensions?: PersonExtensionsPatch;
}

export const createPerson = async (reg: Reg, input: CreatePersonInput): Promise<Result<{ readonly id: string; readonly path: string }>> => {
  if (input.extensions?.org?.leadId && !(await reg.prisma.person.findUnique({ where: { id: input.extensions.org.leadId }, select: { id: true } }))) {
    return err(new Error(`Lead ${input.extensions.org.leadId} not found. Find ids with person.list.`));
  }
  const person = await reg.prisma.person.create({ data: { name: input.name, email: input.email } });
  const extended = await applyExtensions(reg, person.id, input.extensions);
  if (!extended.ok) return err(extended.error);
  return ok({ id: person.id, path: entityPath('PERSON', person.id) });
};

export interface UpdatePersonInput {
  readonly name?: string;
  readonly email?: string | null;
  readonly extensions?: PersonExtensionsPatch;
}

export const updatePerson = async (reg: Reg, id: string, input: UpdatePersonInput): Promise<Result<{ readonly id: string }>> => {
  if (!(await reg.prisma.person.findUnique({ where: { id }, select: { id: true } }))) return err(notFound(id));
  const writable = await ensureWritable(reg, 'PERSON', id);
  if (!writable.ok) return err(writable.error);

  if (input.name !== undefined || input.email !== undefined) {
    await reg.prisma.person.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email })
      }
    });
  }
  const extended = await applyExtensions(reg, id, input.extensions);
  if (!extended.ok) return err(extended.error);
  return ok({ id });
};

/** Also deletes what's attached to the person and their relations, and clears them as an owner. */
export const deletePerson = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  if (!(await reg.prisma.person.findUnique({ where: { id }, select: { id: true } }))) return err(notFound(id));
  const cleanup = await planEntityCleanup(reg, 'PERSON', id);
  await reg.prisma.$transaction([...cleanup.ops, reg.prisma.person.delete({ where: { id } })]);
  await removeFiles(reg, cleanup.files);
  return ok({ deleted: true as const });
};
