// Notebooks against the test data directory: isolation, the notebook procedures,
// resolving the current notebook, the request handle, the files route, and the
// one-time move of a pre-notebooks data directory.

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { appRouter } from '../../src/shared/trpc/router';
import { createCallerFactory } from '../../src/shared/trpc/init';
import { createNotebookContext } from '../../src/shared/trpc/context.server';
import { getReadyRegistry } from '../../src/shared/db/bootstrap.server';
import { getRegistry } from '../../src/shared/registry.server';
import { resolveCurrentNotebook } from '../../src/shared/notebooks/current.server';
import { migrateLayout } from '../../src/shared/notebooks/layout.server';
import { moveLegacyDataDir } from '../../src/shared/settings/server/legacy-data-dir';
import { notebookHandle } from '../../src/shared/notebooks/handle.server';
import { NOTEBOOK_COOKIE } from '../../src/shared/notebooks/id';
import type { NotebookInfo } from '../../src/shared/types/notebook';
import { GET as getFile } from '../../src/routes/files/[...key]/+server';
import { OTHER_NOTEBOOK, TEST_NOTEBOOK } from './test-notebooks';

const notebook = async (id: string): Promise<NotebookInfo> => {
  const found = await resolveCurrentNotebook({ explicit: id });
  if (!found.ok) throw found.error;
  return found.value;
};

const callerFor = async (id: string) => createCallerFactory(appRouter)(await createNotebookContext(await notebook(id)));

const fakeEvent = (url: string, cookie?: string, isDataRequest = false) => {
  const setCookies: Array<[string, string]> = [];
  const event = {
    url: new URL(url),
    request: new Request(url),
    isDataRequest,
    locals: {} as App.Locals,
    cookies: {
      get: (name: string) => (name === NOTEBOOK_COOKIE ? cookie : undefined),
      set: (name: string, value: string) => setCookies.push([name, value]),
      serialize: (name: string, value: string) => `${name}=${value}`
    }
  };
  return { event, setCookies };
};

const page = async (): Promise<Response> => new Response('page');

describe('notebooks', () => {
  it("keeps each notebook's data and files separate", async () => {
    const other = await getReadyRegistry(OTHER_NOTEBOOK);
    await other.prisma.person.create({ data: { id: 'person_zed', name: 'Zed Other' } });
    await other.storage.putObject('branding/b1/logo-a.png', new Uint8Array([1, 2, 3]), 'image/png');

    const test = getRegistry(TEST_NOTEBOOK);
    expect((await test.prisma.person.findMany()).map((p) => p.id).sort()).toEqual(['person_alice', 'person_bob', 'person_carol']);
    expect((await other.prisma.person.findMany()).map((p) => p.id)).toEqual(['person_zed']);
    expect(await test.storage.readObject('branding/b1/logo-a.png')).toBeNull();
    expect(await other.storage.readObject('branding/b1/logo-a.png')).not.toBeNull();
  });

  it('lists, creates, renames and sets the default through the procedures', async () => {
    const caller = await callerFor(OTHER_NOTEBOOK);

    const listed = await caller.notebook.list();
    expect(listed.ok && listed.value.map((n) => [n.id, n.isCurrent, n.isDefault])).toEqual([
      [TEST_NOTEBOOK, false, true],
      [OTHER_NOTEBOOK, true, false]
    ]);

    const created = await caller.notebook.create({ name: 'Side Project' });
    expect(created.ok && created.value.id).toBe('side-project');
    const duplicate = await caller.notebook.create({ name: 'side project', id: 'side-2' });
    expect(!duplicate.ok && duplicate.error.message).toContain('already a notebook named "Side Project"');
    const badId = await caller.notebook.create({ name: 'Garden', id: 'My Garden' });
    expect(!badId.ok && badId.error.message).toContain("can't be a notebook id");

    expect((await caller.notebook.rename({ id: 'side-project', name: 'Garden' })).ok).toBe(true);
    expect((await notebook('garden')).id).toBe('side-project');

    expect((await caller.notebook.setDefault({ id: 'side-project' })).ok).toBe(true);
    const current = await resolveCurrentNotebook({});
    expect(current.ok && current.value.id).toBe('side-project');
    expect((await caller.notebook.setDefault({ id: TEST_NOTEBOOK })).ok).toBe(true);

    const unknown = await resolveCurrentNotebook({ explicit: 'nope' });
    expect(!unknown.ok && unknown.error.message).toContain('There is no notebook "nope"');
  });

  it('switches with ?notebook=, remembers it in a cookie, and falls back to the default', async () => {
    const link = fakeEvent('http://127.0.0.1:5173/app/reports/r1?notebook=other&popup=x');
    const redirected = await notebookHandle({ event: link.event as never, resolve: page });
    expect(redirected.status).toBe(303);
    expect(redirected.headers.get('location')).toBe('/app/reports/r1?popup=x');
    expect(redirected.headers.get('set-cookie')).toBe(`${NOTEBOOK_COOKIE}=${OTHER_NOTEBOOK}`);

    const data = fakeEvent('http://127.0.0.1:5173/app?notebook=other', undefined, true);
    expect((await notebookHandle({ event: data.event as never, resolve: page })).status).toBe(200);
    expect(data.setCookies).toEqual([[NOTEBOOK_COOKIE, OTHER_NOTEBOOK]]);

    const remembered = fakeEvent('http://127.0.0.1:5173/app', OTHER_NOTEBOOK);
    expect((await notebookHandle({ event: remembered.event as never, resolve: page })).status).toBe(200);
    expect(remembered.event.locals.notebook.id).toBe(OTHER_NOTEBOOK);

    const stale = fakeEvent('http://127.0.0.1:5173/app', 'gone');
    await notebookHandle({ event: stale.event as never, resolve: page });
    expect(stale.event.locals.notebook.id).toBe(TEST_NOTEBOOK);

    const unknown = fakeEvent('http://127.0.0.1:5173/app?notebook=gone');
    expect((await notebookHandle({ event: unknown.event as never, resolve: page })).status).toBe(404);
  });

  it("serves files from the request's notebook", async () => {
    const params = { key: 'branding/b1/logo-a.png' };
    const found = await getFile({ params, locals: { notebook: await notebook(OTHER_NOTEBOOK) } } as never);
    expect(new Uint8Array(await found.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await expect(getFile({ params, locals: { notebook: await notebook(TEST_NOTEBOOK) } } as never)).rejects.toMatchObject({ status: 404 });
  });

  it('moves a pre-notebooks data directory into the work-work notebook', async () => {
    const dataDir = mkdtempSync(join(resolve('data/test'), 'legacy-'));
    const legacy = createClient({ url: `file:${join(dataDir, 'working-notes.db')}` });
    await legacy.execute('PRAGMA journal_mode = WAL');
    await legacy.execute('CREATE TABLE person (id TEXT PRIMARY KEY, name TEXT)');
    await legacy.execute("INSERT INTO person VALUES ('person_old', 'Old Friend')");
    legacy.close();
    mkdirSync(join(dataDir, 'files', 'docs', 'd1'), { recursive: true });
    writeFileSync(join(dataDir, 'files', 'docs', 'd1', 'source.pdf'), '%PDF-1.4');
    mkdirSync(join(dataDir, 'Backups', '2026-09-12T19-00-00Z'), { recursive: true });
    writeFileSync(join(dataDir, 'Backups', '2026-09-12T19-00-00Z', 'manifest.json'), '{}');

    const steps = await migrateLayout({ dataDir, licensePublicKey: "" });
    expect(steps.map((s) => s.kind)).toEqual(['create-notebook', 'move-database', 'move-files', 'move-snapshot', 'set-default']);

    const moved = join(dataDir, 'Notebooks', 'work-work');
    expect(existsSync(join(dataDir, 'working-notes.db'))).toBe(false);
    const client = createClient({ url: `file:${join(moved, 'working-notes.db')}` });
    try {
      expect((await client.execute('SELECT name FROM person')).rows.map((r) => r[0])).toEqual(['Old Friend']);
    } finally {
      client.close();
    }
    expect(existsSync(join(moved, 'files', 'docs', 'd1', 'source.pdf'))).toBe(true);
    expect(existsSync(join(dataDir, 'Backups', 'work-work', '2026-09-12T19-00-00Z', 'manifest.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(moved, 'notebook.json'), 'utf8'))).toMatchObject({ name: 'work-work' });
    expect(JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'))).toEqual({ defaultNotebook: 'work-work' });

    expect(await migrateLayout({ dataDir, licensePublicKey: "" })).toEqual([]);
  });

  it('moves the data from before the rename to Remry (from Wonos), and refuses to start over in the old folder', async () => {
    const root = mkdtempSync(join(resolve('data/test'), 'rename-'));
    const legacy = join(root, 'Wonos');
    const current = join(root, 'Remry');
    await migrateLayout({ dataDir: legacy, licensePublicKey: '' });
    const before = JSON.parse(readFileSync(join(legacy, 'settings.json'), 'utf8')) as { defaultNotebook: string };

    expect(moveLegacyDataDir(legacy, current, 'Wonos')).toBe(current);
    expect(await migrateLayout({ dataDir: current, licensePublicKey: '' })).toEqual([]);
    expect(JSON.parse(readFileSync(join(current, 'settings.json'), 'utf8'))).toEqual(before);
    expect(existsSync(join(current, 'Notebooks', before.defaultNotebook, 'notebook.json'))).toBe(true);

    await expect(migrateLayout({ dataDir: legacy, licensePublicKey: '' })).rejects.toThrow(/moved to the Remry folder/);
    expect(existsSync(join(legacy, 'Notebooks'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('keeps using the old folder while an older process has a database open', async () => {
    const root = mkdtempSync(join(resolve('data/test'), 'rename-busy-'));
    const legacy = join(root, 'Wonos');
    await migrateLayout({ dataDir: legacy, licensePublicKey: '' });
    const id = (JSON.parse(readFileSync(join(legacy, 'settings.json'), 'utf8')) as { defaultNotebook: string }).defaultNotebook;
    const db = join(legacy, 'Notebooks', id, 'working-notes.db');
    writeFileSync(db, '');
    const holder = spawn(process.execPath, ['-e', `require('node:fs').openSync(${JSON.stringify(db)}, 'r'); console.log('open'); setTimeout(() => {}, 30000)`], { stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      await new Promise((ready) => holder.stdout.once('data', ready));
      expect(moveLegacyDataDir(legacy, join(root, 'Remry'), 'Wonos')).toBe(legacy);
      expect(existsSync(join(legacy, 'Notebooks', id))).toBe(true);
    } finally {
      holder.kill();
    }
  });
});

