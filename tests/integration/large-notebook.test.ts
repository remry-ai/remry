// A notebook with more than a thousand of everything. SQLite's driver takes up to 32,766
// values in one query, but Prisma assumes 999 for SQLite unless the adapter says otherwise,
// and refuses (P2029, "query parameter limit exceeded") a query that loads related rows for
// more parents than that: goal.list failed at 1,000 goals. The test seeds 1,100 rows of each
// kind, with one "hub" of each type linked to all of them (a lead with 1,100 reports, a team
// with 1,100 members, a project with 1,100 sub-projects…), then calls every query procedure
// with each input it accepts, and finally deletes the hubs. Any thrown error, or a result
// naming the database, fails it.

import { describe, it, expect, beforeAll } from 'vitest';
import type { ZodTypeAny } from 'zod';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { getRegistry } from '../../src/shared/registry.server';
import { activateLicense } from '../../src/shared/license/store.server';
import { testLicenseKey } from '../license-test-key';
import { TEST_NOTEBOOK } from './test-notebooks';

const N = 1100;
const range = (prefix: string): readonly string[] => Array.from({ length: N }, (_, i) => `${prefix}_${i}`);

const HUB = {
  PERSON: 'hub_person',
  GROUP: 'hub_group',
  PROJECT: 'hub_project',
  GOAL: 'hub_goal',
  PAGE: 'hub_page'
} as const;

const people = range('big_person');
const groups = range('big_group');
const projects = range('big_project');
const goals = range('big_goal');
const pages = range('big_page');

const seed = async (): Promise<void> => {
  // Pro, so full-text search and recall run instead of answering with the lock message.
  const license = await activateLicense(testLicenseKey());
  if (!license.ok) throw license.error;
  const db = getRegistry(TEST_NOTEBOOK).prisma;
  const at = new Date('2026-06-01T00:00:00Z');

  await db.person.createMany({ data: [{ id: HUB.PERSON, name: 'Hub person' }, ...people.map((id, i) => ({ id, name: `Big person ${i}` }))] });
  await db.orgPerson.createMany({ data: people.map((personId, i) => ({ personId, title: `Engineer ${i}` })) });
  // The hub leads everyone (a person has one lead).
  await db.personRelation.createMany({ data: people.map((toPersonId) => ({ fromPersonId: HUB.PERSON, toPersonId, kind: 'LEAD_OF' })) });

  await db.group.createMany({
    data: [{ id: HUB.GROUP, kind: 'TEAM', name: 'Hub team' }, ...groups.map((id, i) => ({ id, kind: i % 2 ? 'TEAM' : 'DEPARTMENT', name: `Big group ${i}` }))]
  });
  await db.groupMember.createMany({
    data: [
      ...people.map((personId) => ({ groupId: HUB.GROUP, personId })),
      ...groups.map((groupId, i) => ({ groupId, personId: people[i]! }))
    ]
  });

  await db.project.createMany({
    data: [
      { id: HUB.PROJECT, name: 'Hub project', ownerType: 'PERSON', ownerId: HUB.PERSON, status: 'IN_PROGRESS' },
      ...projects.map((id, i) => ({ id, name: `Big project ${i}`, parentId: HUB.PROJECT, ownerType: i % 2 ? 'PERSON' : 'GROUP', ownerId: i % 2 ? people[i]! : groups[i]!, status: 'COMMITTED' }))
    ]
  });

  await db.goal.createMany({
    data: [
      { id: HUB.GOAL, title: 'Hub goal', ownerType: 'GROUP', ownerId: HUB.GROUP, period: '2026', target: 100 },
      ...goals.map((id, i) => ({ id, title: `Big goal ${i}`, parentId: HUB.GOAL, ownerType: i % 2 ? 'PERSON' : 'GROUP', ownerId: i % 2 ? people[i]! : groups[i]!, period: '2026-H2', target: 10 }))
    ]
  });
  await db.goalCheckIn.createMany({ data: goals.map((goalId, i) => ({ goalId, date: at, value: i % 10, status: 'ON_TRACK' })) });
  await db.goalProject.createMany({ data: projects.map((projectId) => ({ goalId: HUB.GOAL, projectId })) });

  await db.page.createMany({
    data: [{ id: HUB.PAGE, title: 'Hub page', content: 'The hub' }, ...pages.map((id, i) => ({ id, title: `Big page ${i}`, parentId: HUB.PAGE, content: `Page ${i}` }))]
  });

  // Everything attached to the hub person, and links from it to every page.
  const on = { entityType: 'PERSON', entityId: HUB.PERSON };
  await db.todo.createMany({ data: range('todo').map((id, i) => ({ id, title: `Big todo ${i}`, ...on })) });
  await db.note.createMany({ data: range('note').map((id, i) => ({ id, content: `Big note ${i}`, ...on })) });
  await db.doc.createMany({ data: range('doc').map((id, i) => ({ id, title: `Big doc ${i}`, content: `Doc ${i}`, sortOrder: i, ...on })) });
  await db.link.createMany({ data: range('link').map((id, i) => ({ id, url: `https://example.com/${i}`, title: `Big link ${i}`, ...on })) });
  await db.comment.createMany({ data: range('comment').map((id, i) => ({ id, content: `Big comment ${i}`, ...on })) });
  await db.tag.createMany({ data: range('tag').map((id, i) => ({ id, name: `big-tag-${i}` })) });
  await db.tagAttachment.createMany({ data: range('tag').map((tagId) => ({ tagId, ...on })) });
  await db.relation.createMany({
    data: [
      ...pages.map((toId) => ({ fromType: 'PERSON', fromId: HUB.PERSON, toType: 'PAGE', toId })),
      ...projects.map((toId) => ({ fromType: 'PROJECT', fromId: HUB.PROJECT, toType: 'PROJECT', toId, kind: 'DEPENDS_ON' }))
    ]
  });
};

const caller = async () => {
  const notebook = await resolveCurrentNotebook({ explicit: TEST_NOTEBOOK });
  if (!notebook.ok) throw notebook.error;
  return createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
};

type Api = Awaited<ReturnType<typeof caller>>;

interface Procedure {
  readonly path: string;
  readonly type: string;
  readonly input: ZodTypeAny | null;
}

const procedures = (): readonly Procedure[] =>
  Object.entries((appRouter as unknown as { _def: { procedures: Record<string, { _def: { type?: string; inputs?: unknown[] } }> } })._def.procedures)
    .map(([path, proc]) => ({ path, type: proc._def.type ?? 'query', input: (proc._def.inputs?.[0] as ZodTypeAny | undefined) ?? null }));

/** The hub a procedure's namespace is about ("goal.get" → the hub goal). */
const hubFor = (path: string): string | null => {
  const ns = path.split('.')[0]!;
  const byNamespace: Record<string, string> = { person: HUB.PERSON, group: HUB.GROUP, project: HUB.PROJECT, goal: HUB.GOAL, page: HUB.PAGE };
  return byNamespace[ns] ?? null;
};

/** Every input worth trying: none, the namespace's hub by id, and each hub as the entity, owner, parent, or by its own key. */
const candidateInputs = (path: string): readonly Record<string, unknown>[] => {
  const hub = hubFor(path);
  const hubs = Object.entries(HUB);
  return [
    {},
    { closed: 'include' },
    ...(hub ? [{ id: hub }, { parentId: hub }] : []),
    ...hubs.map(([entityType, entityId]) => ({ entityType, entityId })),
    ...hubs.map(([type, id]) => ({ type, id })),
    ...hubs.map(([ownerType, ownerId]) => ({ ownerType, ownerId })),
    { personId: HUB.PERSON },
    { groupId: HUB.GROUP },
    { projectId: HUB.PROJECT },
    { goalId: HUB.GOAL },
    { pageId: HUB.PAGE },
    { q: 'big' },
    { q: 'big', limit: 50 }
  ];
};

const call = async (api: Api, path: string, input: unknown): Promise<unknown> => {
  const fn = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], api) as (value: unknown) => Promise<unknown>;
  return fn(input);
};

/** Text that means the database refused the query, not that the input was turned away. */
const DATABASE_FAILURE = /parameter limit|too many SQL variables|SQLITE_|prisma|P20\d\d/i;

describe('a notebook with more than a thousand of everything', () => {
  beforeAll(seed, 60_000);

  it('answers every query, for every hub', async () => {
    const api = await caller();
    const failures: string[] = [];
    let calls = 0;

    // trpcMeta lists the router itself and touches no database.
    for (const proc of procedures().filter((p) => p.type === 'query' && !p.path.startsWith('trpcMeta.'))) {
      const inputs = proc.input ? candidateInputs(proc.path).filter((input) => proc.input!.safeParse(input).success) : [undefined];
      // Every input that parses the same way is tried once (several candidates strip to {}).
      const seen = new Set<string>();
      for (const input of inputs) {
        const parsed = proc.input ? JSON.stringify(proc.input.safeParse(input).data) : 'none';
        if (seen.has(parsed)) continue;
        seen.add(parsed);
        calls++;
        try {
          const result = await call(api, proc.path, input);
          const message = (result as { ok?: boolean; error?: { message?: string } } | null)?.ok === false ? String((result as { error?: { message?: string } }).error?.message) : null;
          if (message && (DATABASE_FAILURE.test(message) || message.includes('Remry Pro'))) failures.push(`${proc.path} ${JSON.stringify(input)}: ${message.slice(0, 160)}`);
        } catch (error) {
          // A module the notebook doesn't have, or a feature that's off, is refused on purpose.
          if (error instanceof TRPCError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND' || error.code === 'BAD_REQUEST')) continue;
          failures.push(`${proc.path} ${JSON.stringify(input)}: ${String((error as Error).message).replace(/\s+/g, ' ').slice(-160)}`);
        }
      }
    }

    expect(calls).toBeGreaterThan(50);
    expect(failures).toEqual([]);
  }, 300_000);

  it('lists all of them', async () => {
    const api = await caller();
    const lists = [
      await api.person.list(),
      await api.group.list(),
      await api.project.list({ closed: 'include' }),
      await api.goal.list({ closed: 'include' }),
      await api.page.list()
    ];
    for (const list of lists) {
      expect(list.ok).toBe(true);
      if (list.ok) expect(list.value.length).toBeGreaterThan(N);
    }
  }, 60_000);

  it('deletes a hub with everything linked to it', async () => {
    const api = await caller();
    for (const [entityType, id] of Object.entries(HUB)) {
      const result = (await api.entity.delete({ entityType: entityType as keyof typeof HUB, id })) as { ok: boolean; error?: { message: string } };
      expect(result.error?.message ?? 'ok', entityType).toBe('ok');
    }
  }, 120_000);
});
