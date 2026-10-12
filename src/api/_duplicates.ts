// Cross-domain helper (not a domain): refusing a second person, group or project with
// a name already in use. Claude files things by name ("Dana moved to Payments"), so a
// near-identical name is far more often the same thing than a namesake, and a
// duplicate quietly splits its notes and todos in two. allowDuplicate is the way out.

import type { Registry } from '$shared/registry';

/** Names compare without case or extra spaces: "dana  park" is "Dana Park". */
export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

export interface NamedRow {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: Date | null;
}

/** Pure. The first row with the same name, if any. */
export const sameName = <T extends NamedRow>(rows: readonly T[], name: string): T | undefined => {
  const wanted = normalizeName(name);
  return rows.find((row) => normalizeName(row.name) === wanted);
};

/** Pure. The refusal, naming the one that exists and both ways forward. */
export const duplicateNameError = (singular: string, update: string, existing: NamedRow): Error =>
  new Error(
    `${singular} "${existing.name}" already exists (id ${existing.id}${existing.archivedAt ? ', archived' : ''}). ` +
    `Change that one with ${update} --id ${existing.id}, or pass allowDuplicate: true if this is a different ${singular.toLowerCase()} with the same name.`
  );

type Reg = Pick<Registry, 'prisma'>;
const NAMED = { id: true, name: true, archivedAt: true } as const;

/** People with this name, archived ones included. */
export const findPersonNamed = async (reg: Reg, name: string): Promise<NamedRow | undefined> =>
  sameName(await reg.prisma.person.findMany({ select: NAMED }), name);

/** Groups of this kind with this name: a Platform team and a Platform department can both exist. */
export const findGroupNamed = async (reg: Reg, kind: string, name: string): Promise<NamedRow | undefined> =>
  sameName(await reg.prisma.group.findMany({ where: { kind }, select: NAMED }), name);

export const findProjectNamed = async (reg: Reg, name: string): Promise<NamedRow | undefined> =>
  sameName(await reg.prisma.project.findMany({ select: NAMED }), name);
