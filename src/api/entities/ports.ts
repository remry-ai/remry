// The core's view of each entity type: its display name and, for archivable
// types, its archived state. Cross-domain helpers (_entity-labels, _archive)
// dispatch here instead of switching on the type, so a new entity type is one
// entry. Module-specific links (a person's lead) are person extensions
// ($api/modules/person-extensions), not ports.

import type { Registry } from '$shared/registry';
import type { ArchivableType, EntityType } from '$shared/types/enums';

type Reg = Pick<Registry, 'prisma'>;

export interface ArchiveState {
  readonly name: string;
  readonly archivedAt: Date | null;
}

export interface ArchivablePort {
  readonly state: (reg: Reg, id: string) => Promise<ArchiveState | null>;
  readonly setArchivedAt: (reg: Reg, id: string, archivedAt: Date | null) => Promise<void>;
  readonly archivedIds: (reg: Reg) => Promise<readonly string[]>;
}

const firstLine = (content: string, max = 80): string => {
  const line = content
    .split('\n')
    .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
    .find((l) => l.length > 0) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line || '(empty note)';
};

const archived = { where: { archivedAt: { not: null } }, select: { id: true } } as const;
const ids = (rows: readonly { readonly id: string }[]): readonly string[] => rows.map((r) => r.id);

export const ARCHIVABLE_PORTS: Readonly<Record<ArchivableType, ArchivablePort>> = {
  PERSON: {
    state: (reg, id) => reg.prisma.person.findUnique({ where: { id }, select: { name: true, archivedAt: true } }),
    setArchivedAt: async (reg, id, archivedAt) => { await reg.prisma.person.update({ where: { id }, data: { archivedAt } }); },
    archivedIds: async (reg) => ids(await reg.prisma.person.findMany(archived))
  },
  GROUP: {
    state: (reg, id) => reg.prisma.group.findUnique({ where: { id }, select: { name: true, archivedAt: true } }),
    setArchivedAt: async (reg, id, archivedAt) => { await reg.prisma.group.update({ where: { id }, data: { archivedAt } }); },
    archivedIds: async (reg) => ids(await reg.prisma.group.findMany(archived))
  },
  PROJECT: {
    state: (reg, id) => reg.prisma.project.findUnique({ where: { id }, select: { name: true, archivedAt: true } }),
    setArchivedAt: async (reg, id, archivedAt) => { await reg.prisma.project.update({ where: { id }, data: { archivedAt } }); },
    archivedIds: async (reg) => ids(await reg.prisma.project.findMany(archived))
  },
  GOAL: {
    state: async (reg, id) => {
      const row = await reg.prisma.goal.findUnique({ where: { id }, select: { title: true, archivedAt: true } });
      return row && { name: row.title, archivedAt: row.archivedAt };
    },
    setArchivedAt: async (reg, id, archivedAt) => { await reg.prisma.goal.update({ where: { id }, data: { archivedAt } }); },
    archivedIds: async (reg) => ids(await reg.prisma.goal.findMany(archived))
  },
  PAGE: {
    state: async (reg, id) => {
      const row = await reg.prisma.page.findUnique({ where: { id }, select: { title: true, archivedAt: true } });
      return row && { name: row.title, archivedAt: row.archivedAt };
    },
    setArchivedAt: async (reg, id, archivedAt) => { await reg.prisma.page.update({ where: { id }, data: { archivedAt } }); },
    archivedIds: async (reg) => ids(await reg.prisma.page.findMany(archived))
  }
};

/** Display names, for every type that has one. */
export const LABEL_PORTS: Readonly<Partial<Record<EntityType, (reg: Reg, id: string) => Promise<string | null>>>> = {
  PERSON: async (reg, id) => (await ARCHIVABLE_PORTS.PERSON.state(reg, id))?.name ?? null,
  GROUP: async (reg, id) => (await ARCHIVABLE_PORTS.GROUP.state(reg, id))?.name ?? null,
  PROJECT: async (reg, id) => (await ARCHIVABLE_PORTS.PROJECT.state(reg, id))?.name ?? null,
  GOAL: async (reg, id) => (await ARCHIVABLE_PORTS.GOAL.state(reg, id))?.name ?? null,
  PAGE: async (reg, id) => (await ARCHIVABLE_PORTS.PAGE.state(reg, id))?.name ?? null,
  DOC: async (reg, id) => (await reg.prisma.doc.findUnique({ where: { id }, select: { title: true } }))?.title ?? null,
  REPORT: async (reg, id) => (await reg.prisma.report.findUnique({ where: { id }, select: { title: true } }))?.title ?? null,
  TODO: async (reg, id) => (await reg.prisma.todo.findUnique({ where: { id }, select: { title: true } }))?.title ?? null,
  NOTE: async (reg, id) => {
    const note = await reg.prisma.note.findUnique({ where: { id }, select: { content: true } });
    return note ? firstLine(note.content) : null;
  }
};
