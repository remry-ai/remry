import { describe, it, expect } from 'vitest';
import type { NotebookStore } from '$shared/notebooks/store.server';
import type { NotebookInfo } from '$shared/types/notebook';
import { createNotebook, listNotebooks, renameNotebook, setDefaultNotebook, setNotebookProfile } from '../operations';

const memoryStore = (initial: readonly NotebookInfo[], defaultId: string | null): NotebookStore => {
  const notebooks = [...initial];
  let currentDefault = defaultId;
  return {
    list: async () => [...notebooks],
    create: async (notebook) => {
      notebooks.push(notebook);
    },
    rename: async (id, name) => {
      const i = notebooks.findIndex((n) => n.id === id);
      notebooks[i] = { ...notebooks[i]!, name };
    },
    setProfile: async (id, profile) => {
      const i = notebooks.findIndex((n) => n.id === id);
      notebooks[i] = { ...notebooks[i]!, profile };
    },
    getDefault: async () => currentDefault,
    setDefault: async (id) => {
      currentDefault = id;
    }
  };
};

const WORK: NotebookInfo = { id: 'work-work', name: 'Work', profile: 'work', createdAt: '2026-01-01T00:00:00.000Z' };
const GARDEN: NotebookInfo = { id: 'garden', name: 'Garden', profile: 'home', createdAt: '2026-02-01T00:00:00.000Z' };

const deps = () => ({ notebooks: memoryStore([WORK, GARDEN], 'work-work'), now: () => new Date('2026-09-13T12:00:00Z') });

describe('notebook operations', () => {
  it('lists notebooks, marking the current one and the default', async () => {
    const result = await listNotebooks(deps(), 'garden');
    expect(result.ok && result.value.map((n) => [n.id, n.isCurrent, n.isDefault])).toEqual([
      ['work-work', false, true],
      ['garden', true, false]
    ]);
  });

  it('creates a notebook with an id made from its name, or the id given', async () => {
    const d = deps();
    const made = await createNotebook(d, { name: '  Side Project ' });
    expect(made.ok && made.value).toEqual({ id: 'side-project', name: 'Side Project', profile: 'work', createdAt: '2026-09-13T12:00:00.000Z' });
    const given = await createNotebook(d, { name: 'Allotment', id: 'plot' });
    expect(given.ok && given.value.id).toBe('plot');
    expect((await d.notebooks.list()).map((n) => n.id)).toEqual(['work-work', 'garden', 'side-project', 'plot']);
  });

  it('refuses duplicate ids and names, bad ids, and names without an id-able character', async () => {
    const message = async (input: { name: string; id?: string }) => {
      const result = await createNotebook(deps(), input);
      return result.ok ? 'ok' : result.error.message;
    };
    expect(await message({ name: 'Other garden', id: 'garden' })).toContain('already a notebook with id "garden"');
    expect(await message({ name: 'GARDEN', id: 'garden-2' })).toContain('already a notebook named "Garden"');
    expect(await message({ name: 'Plot', id: '../plot' })).toContain('"../plot" can\'t be a notebook id');
    expect(await message({ name: '🙂' })).toContain('Pass an id');
    expect(await message({ name: '   ' })).toBe('Give the notebook a name');
  });

  it('renames a notebook, but not onto another notebook\'s name', async () => {
    const d = deps();
    expect(await renameNotebook(d, 'garden', 'Allotment')).toEqual({ ok: true, value: { ...GARDEN, name: 'Allotment' } });
    const clash = await renameNotebook(d, 'garden', 'work');
    expect(!clash.ok && clash.error.message).toContain('already a notebook named "Work"');
    const missing = await renameNotebook(d, 'nope', 'Nope');
    expect(!missing.ok && missing.error.message).toBe('There is no notebook "nope". Notebooks: work-work, garden.');
  });

  it('sets the default only to a notebook that exists', async () => {
    const d = deps();
    expect((await setDefaultNotebook(d, 'garden')).ok).toBe(true);
    expect(await d.notebooks.getDefault()).toBe('garden');
    expect((await setDefaultNotebook(d, 'nope')).ok).toBe(false);
    expect(await d.notebooks.getDefault()).toBe('garden');
  });

  it('sets up a new notebook for its profile', async () => {
    const seeded: string[] = [];
    const d = { ...deps(), setUpModules: async (id: string, profile: string) => { seeded.push(`${id}:${profile}`); } };
    await createNotebook(d, { name: 'Office' });
    const home = await createNotebook(d, { name: 'Home', profile: 'home' });
    expect(home.ok && home.value.profile).toBe('home');
    expect(seeded).toEqual(['office:work', 'home:home']);
  });

  it('changes a notebook\'s profile', async () => {
    const d = deps();
    expect(await setNotebookProfile(d, 'work-work', 'home')).toEqual({ ok: true, value: { ...WORK, profile: 'home' } });
    expect((await d.notebooks.list()).find((n) => n.id === 'work-work')?.profile).toBe('home');
    expect((await setNotebookProfile(d, 'nope', 'home')).ok).toBe(false);
  });
});
