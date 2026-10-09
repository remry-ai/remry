// The notebook a call runs against. Every entry point (hooks, CLI, MCP, backups)
// resolves through here, so the data directory is in the notebook layout first.

import type { NotebookInfo } from '$shared/types/notebook';
import type { Result } from '$shared/utils/result';
import { ensureLayout } from './layout.server';
import { resolveNotebook, type NotebookSources } from './resolve';
import { createNotebookStore, type NotebookStore } from './store.server';

let store: NotebookStore | undefined;

export const getNotebookStore = (): NotebookStore => (store ??= createNotebookStore());

export const readNotebooks = async (): Promise<readonly NotebookInfo[]> => {
  await ensureLayout();
  return getNotebookStore().list();
};

export const resolveCurrentNotebook = async (sources: NotebookSources): Promise<Result<NotebookInfo>> => {
  await ensureLayout();
  const [notebooks, defaultId] = await Promise.all([getNotebookStore().list(), getNotebookStore().getDefault()]);
  return resolveNotebook({ ...sources, notebooks, defaultId });
};
