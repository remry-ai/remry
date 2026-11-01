// Every /app page's server load, in a work and a home notebook, with its tRPC calls
// answered by the real router: none may throw. A load that asks for something the
// notebook's modules don't include (goal.list in a home notebook) gets a FORBIDDEN,
// which throws from the client and made every project page in a home notebook a 500
// before 0.16.65. Pages are found with import.meta.glob, so a new page is covered too.

import { beforeAll, describe, expect, it } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { isRedirect } from '@sveltejs/kit';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { TRPC_BASE_PATH } from '../../src/shared/trpc/config';
import { notebookModel } from '../../src/shared/modules/model';
import type { NotebookInfo } from '../../src/shared/types/notebook';
import { createBranding } from '../../src/api/branding/operations';
import { getRegistry } from '../../src/shared/registry.server';
import { TEST_NOTEBOOK } from './test-notebooks';

type Load = (event: Record<string, unknown>) => unknown;

const pages = import.meta.glob<{ readonly load?: Load }>('../../src/routes/app/**/+page.server.ts', { eager: true });

/** `../../src/routes/app/projects/[id]/+page.server.ts` → `/app/projects/[id]`. */
const routeOf = (file: string): string => file.replace('../../src/routes', '').replace(/\/\+page\.server\.ts$/, '');

const must = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const WORK: NotebookInfo = { id: TEST_NOTEBOOK, name: 'Notebook', profile: 'work', createdAt: '' };
const HOME_ID = 'pages-home';

/** One of each entity a detail page shows, keyed by the route's first segment. */
type Ids = Record<string, string>;

const seed = async (notebook: NotebookInfo): Promise<Ids> => {
  const api = createCallerFactory(appRouter)(await createNotebookContext(notebook));
  const kind = notebook.profile === 'home' ? 'FAMILY' : 'TEAM';
  const person = must(await api.person.create({ name: `Page person ${notebook.id}` }));
  const group = must(await api.group.create({ kind, name: `Page group ${notebook.id}` }));
  const project = must(await api.project.create({ name: `Launch plans ${notebook.id}`, ownerType: 'PERSON', ownerId: person.id }));
  const page = must(await api.page.create({ title: `Page ${notebook.id}`, content: 'Hello' }));
  const doc = must(await api.doc.add({ entityType: 'PROJECT', entityId: project.id, title: 'Plan' }));
  must(await api.todo.create({ title: 'Book venue', entityType: 'PROJECT', entityId: project.id }));
  // branding.create needs a Pro license; the operation doesn't.
  const branding = must(await createBranding(getRegistry(notebook.id), { name: `Brand ${notebook.id}` }));
  const ids: Ids = { branding: branding.id, people: person.id, groups: group.id, teams: group.id, departments: group.id, projects: project.id, wiki: page.id, docs: doc.id };
  if (notebookModel(notebook.profile).has('goals')) {
    const goal = must(await api.goal.create({ title: 'Ship it', ownerType: 'PERSON', ownerId: person.id }));
    must(await api.goal.addProject({ goalId: goal.id, projectId: project.id }));
    return { ...ids, goals: goal.id };
  }
  return ids;
};

/** SvelteKit's `fetch` for a load: tRPC requests go to the router with the notebook's context. */
const fetchFor = (notebook: NotebookInfo) => async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const req = new Request(new URL(String(input), 'http://127.0.0.1'), init);
  if (!new URL(req.url).pathname.startsWith(TRPC_BASE_PATH)) throw new Error(`Unexpected fetch in a load: ${req.url}`);
  return fetchRequestHandler({ endpoint: TRPC_BASE_PATH, req, router: appRouter, createContext: () => createNotebookContext(notebook) });
};

const runLoad = async (notebook: NotebookInfo, ids: Ids, route: string, load: Load): Promise<unknown> => {
  const id = ids[route.split('/')[2] ?? ''];
  const pathname = route.replace('[id]', id ?? 'missing');
  return load({
    fetch: fetchFor(notebook),
    params: { id },
    url: new URL(pathname, 'http://127.0.0.1'),
    locals: { notebook },
    parent: async () => ({}),
    depends: () => undefined,
    setHeaders: () => undefined
  });
};

const notebooks: Record<'work' | 'home', { info: NotebookInfo; ids: Ids }> = {
  work: { info: WORK, ids: {} },
  home: { info: { id: HOME_ID, name: 'Home', profile: 'home', createdAt: '' }, ids: {} }
};

beforeAll(async () => {
  const api = createCallerFactory(appRouter)(await createNotebookContext(WORK));
  // Through the procedure, so the home notebook gets its modules' group and relation kinds.
  const created = must(await api.notebook.create({ id: HOME_ID, name: 'Home', profile: 'home' }));
  notebooks.home.info = { id: created.id, name: created.name, profile: created.profile, createdAt: created.createdAt };
  notebooks.work.ids = await seed(notebooks.work.info);
  notebooks.home.ids = await seed(notebooks.home.info);
});

it('finds the app\'s pages', () => {
  expect(Object.keys(pages).map(routeOf)).toEqual(expect.arrayContaining(['/app', '/app/projects/[id]', '/app/people/[id]']));
});

describe.each(['work', 'home'] as const)('every page in a %s notebook', (profile) => {
  const routes = Object.entries(pages).filter(([, mod]) => mod.load).map(([file, mod]) => [routeOf(file), mod.load!] as const);

  it.each(routes)('%s loads', async (route, load) => {
    const { info, ids } = notebooks[profile];
    // Pages a module owns are sent home by the /app layout (requireRoute) in a notebook without it.
    if (notebookModel(info.profile).routeOwner(route)) return;
    try {
      await runLoad(info, ids, route, load);
    } catch (e) {
      // /app/teams and /app/departments only redirect to /app/groups.
      if (isRedirect(e)) return;
      throw e;
    }
  });
});
