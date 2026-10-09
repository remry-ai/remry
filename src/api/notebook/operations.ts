// Notebooks: list, create, rename, and choose the default the CLI and MCP tools use.
// There is deliberately no delete: removing a notebook means moving its folder out
// of <data dir>/Notebooks by hand, and its snapshots stay in Backups.

import { ok, err, type Result } from '$shared/utils/result';
import { isNotebookId, notebookIdFromName, NOTEBOOK_ID_RULE } from '$shared/notebooks/id';
import type { NotebookStore } from '$shared/notebooks/store.server';
import type { NotebookInfo, NotebookProfile, NotebookSummary } from '$shared/types/notebook';

export interface NotebookDeps {
  readonly notebooks: NotebookStore;
  readonly now: () => Date;
  /** Gives a notebook what its profile's modules start with (group kinds; page kinds for work). */
  readonly setUpModules?: (notebookId: string, profile: NotebookProfile) => Promise<void>;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

const notFound = (id: string, notebooks: readonly NotebookInfo[]): Error =>
  new Error(`There is no notebook "${id}". Notebooks: ${notebooks.map((n) => n.id).join(', ') || 'none'}.`);

export const listNotebooks = async (
  deps: Pick<NotebookDeps, 'notebooks'>,
  currentId: string
): Promise<Result<readonly NotebookSummary[]>> => {
  const [notebooks, defaultId] = await Promise.all([deps.notebooks.list(), deps.notebooks.getDefault()]);
  return ok(notebooks.map((n) => ({ ...n, isCurrent: n.id === currentId, isDefault: n.id === defaultId })));
};

export const createNotebook = async (
  deps: NotebookDeps,
  input: { readonly name: string; readonly id?: string; readonly profile?: NotebookProfile }
): Promise<Result<NotebookInfo>> => {
  const name = input.name.trim();
  if (!name) return err(new Error('Give the notebook a name'));

  const id = input.id?.trim() || notebookIdFromName(name);
  if (!isNotebookId(id)) {
    return err(new Error(input.id?.trim()
      ? `"${id}" can't be a notebook id. Use ${NOTEBOOK_ID_RULE}.`
      : `Couldn't make an id from "${name}". Pass an id: ${NOTEBOOK_ID_RULE}.`));
  }

  const existing = await deps.notebooks.list();
  const sameId = existing.find((n) => n.id === id);
  if (sameId) return err(new Error(`There is already a notebook with id "${id}" (${sameId.name}). Pass a different id.`));
  const named = existing.find((n) => sameName(n.name, name));
  if (named) return err(new Error(`There is already a notebook named "${named.name}" (id ${named.id}).`));

  const notebook: NotebookInfo = { id, name, profile: input.profile ?? 'work', createdAt: deps.now().toISOString() };
  await deps.notebooks.create(notebook);
  await deps.setUpModules?.(notebook.id, notebook.profile);
  return ok(notebook);
};

export const renameNotebook = async (
  deps: Pick<NotebookDeps, 'notebooks'>,
  id: string,
  name: string
): Promise<Result<NotebookInfo>> => {
  const trimmed = name.trim();
  if (!trimmed) return err(new Error('Give the notebook a name'));
  const existing = await deps.notebooks.list();
  const notebook = existing.find((n) => n.id === id);
  if (!notebook) return err(notFound(id, existing));
  const named = existing.find((n) => n.id !== id && sameName(n.name, trimmed));
  if (named) return err(new Error(`There is already a notebook named "${named.name}" (id ${named.id}).`));

  await deps.notebooks.rename(id, trimmed);
  return ok({ ...notebook, name: trimmed });
};

/** Also adds the new profile's starting group kinds; nothing is removed. */
export const setNotebookProfile = async (
  deps: Pick<NotebookDeps, 'notebooks' | 'setUpModules'>,
  id: string,
  profile: NotebookProfile
): Promise<Result<NotebookInfo>> => {
  const existing = await deps.notebooks.list();
  const notebook = existing.find((n) => n.id === id);
  if (!notebook) return err(notFound(id, existing));
  await deps.notebooks.setProfile(id, profile);
  await deps.setUpModules?.(id, profile);
  return ok({ ...notebook, profile });
};

export const setDefaultNotebook = async (
  deps: Pick<NotebookDeps, 'notebooks'>,
  id: string
): Promise<Result<NotebookInfo>> => {
  const existing = await deps.notebooks.list();
  const notebook = existing.find((n) => n.id === id);
  if (!notebook) return err(notFound(id, existing));
  await deps.notebooks.setDefault(id);
  return ok(notebook);
};
