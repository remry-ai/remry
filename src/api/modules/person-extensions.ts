// What modules add to people, each in its own table. The person domain and the
// focus graph call these; core code never reads org_person or personal_person.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { ModuleId } from '$shared/modules/types';
import type { OrgPersonData, OrgPersonDetail, PersonalPersonData } from '$shared/types/person';
import type { orgPersonPatch, personalPersonPatch } from '$shared/types/person';
import type { z } from 'zod';
import type { FocusLink } from '$api/home/focus-node';
import { seedPersonRelationKinds } from '$api/person-relation-kind/operations';
import { setExclusiveRelation } from '$api/person-relation/operations';
import { ORG_MODULE } from '$shared/modules/org';

type Reg = Pick<Registry, 'prisma'>;

export interface PersonExtension<Data, Detail, Patch> {
  readonly module: ModuleId;
  readonly load: (reg: Reg, personIds: readonly string[]) => Promise<ReadonlyMap<string, Data>>;
  readonly detail: (reg: Reg, personId: string) => Promise<Detail | null>;
  /** The patch is already validated against the module's schema. */
  readonly update: (reg: Reg, personId: string, patch: Patch) => Promise<Result<void>>;
  /** Links the home graph shows for a person (Reports to, Direct reports). */
  readonly structuralLinks: (reg: Reg, personId: string) => Promise<readonly FocusLink[]>;
}

// ----- org: title, and the reporting line as LEAD_OF person relations (lead → report) -----

export const LEAD_KIND = 'LEAD_OF';

const leadRelations = async (
  reg: Reg,
  where: { toPersonId: { in: string[] } } | { fromPersonId: string } | { toPersonId: string }
): Promise<readonly { readonly fromId: string; readonly toId: string }[]> =>
  (await reg.prisma.personRelation.findMany({ where: { kind: LEAD_KIND, ...where }, select: { fromPersonId: true, toPersonId: true } }))
    .map((r) => ({ fromId: r.fromPersonId, toId: r.toPersonId }));

const namesOf = async (reg: Reg, ids: readonly string[]): Promise<ReadonlyMap<string, string>> =>
  new Map((await reg.prisma.person.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));

export const ORG_PERSON: PersonExtension<OrgPersonData, OrgPersonDetail, z.infer<typeof orgPersonPatch>> = {
  module: 'org',
  load: async (reg, ids) => {
    const [titles, leads] = await Promise.all([
      reg.prisma.orgPerson.findMany({ where: { personId: { in: [...ids] } } }),
      leadRelations(reg, { toPersonId: { in: [...ids] } })
    ]);
    const names = await namesOf(reg, leads.map((l) => l.fromId));
    const out = new Map<string, OrgPersonData>();
    for (const t of titles) out.set(t.personId, { title: t.title, leadId: null, leadName: null });
    for (const l of leads) {
      out.set(l.toId, { title: out.get(l.toId)?.title ?? null, leadId: l.fromId, leadName: names.get(l.fromId) ?? null });
    }
    return out;
  },
  detail: async (reg, personId) => {
    const [title, lead, reports] = await Promise.all([
      reg.prisma.orgPerson.findUnique({ where: { personId } }),
      leadRelations(reg, { toPersonId: personId }),
      leadRelations(reg, { fromPersonId: personId })
    ]);
    if (!title && lead.length === 0 && reports.length === 0) return null;
    const ids = [...lead.map((l) => l.fromId), ...reports.map((r) => r.toId)];
    const [names, titles] = await Promise.all([
      namesOf(reg, ids),
      reg.prisma.orgPerson.findMany({ where: { personId: { in: reports.map((r) => r.toId) } } })
    ]);
    const leadId = lead[0]?.fromId ?? null;
    return {
      title: title?.title ?? null,
      leadId,
      leadName: leadId ? names.get(leadId) ?? null : null,
      reports: reports
        .map((r) => ({ id: r.toId, name: names.get(r.toId) ?? '', title: titles.find((t) => t.personId === r.toId)?.title ?? null }))
        .filter((r) => r.name)
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  },
  update: async (reg, personId, patch) => {
    if (patch.title !== undefined) {
      await reg.prisma.orgPerson.upsert({ where: { personId }, create: { personId, title: patch.title }, update: { title: patch.title } });
    }
    if (patch.leadId !== undefined) {
      if (patch.leadId === personId) return err(new Error('A person cannot be their own lead'));
      if (patch.leadId && !(await reg.prisma.person.findUnique({ where: { id: patch.leadId }, select: { id: true } }))) {
        return err(new Error(`Lead ${patch.leadId} not found. Find ids with person.list.`));
      }
      // A person has one lead: replace the relationship, or clear it with null.
      await seedPersonRelationKinds(reg, ORG_MODULE.personRelationKinds);
      const set = await setExclusiveRelation(reg, LEAD_KIND, personId, patch.leadId);
      if (!set.ok) return set;
    }
    return ok(undefined);
  },
  // "Reports to" and "Lead of" are person relations, so the graph shows them already.
  structuralLinks: async () => []
};

// ----- personal: birthday and how you know them -----

const toPersonal = (row: { birthday: string | null; knownAs: string | null }): PersonalPersonData => ({
  birthday: row.birthday,
  knownAs: row.knownAs
});

export const PERSONAL_PERSON: PersonExtension<PersonalPersonData, PersonalPersonData, z.infer<typeof personalPersonPatch>> = {
  module: 'personal',
  load: async (reg, ids) =>
    new Map((await reg.prisma.personalPerson.findMany({ where: { personId: { in: [...ids] } } })).map((r) => [r.personId, toPersonal(r)])),
  detail: async (reg, personId) => {
    const row = await reg.prisma.personalPerson.findUnique({ where: { personId } });
    return row ? toPersonal(row) : null;
  },
  update: async (reg, personId, patch) => {
    const p = patch;
    const data = {
      ...(p.birthday !== undefined && { birthday: p.birthday }),
      ...(p.knownAs !== undefined && { knownAs: p.knownAs })
    };
    await reg.prisma.personalPerson.upsert({ where: { personId }, create: { personId, ...data }, update: data });
    return ok(undefined);
  },
  structuralLinks: async () => []
};

export const PERSON_EXTENSIONS = { org: ORG_PERSON, personal: PERSONAL_PERSON } as const;
