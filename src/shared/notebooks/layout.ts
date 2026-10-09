// Planning the notebook layout of the data directory. Pure: layout.server.ts reads
// the state from disk and applies the steps.
//
// Before notebooks, the data directory held one database, one files folder and its
// snapshots. Those move into the notebook `work-work`. A fresh data directory gets
// one empty notebook. Either way, the default notebook must exist.

import { ok, err, type Result } from '$shared/utils/result';

export const LEGACY_NOTEBOOK = { id: 'work-work', name: 'work-work' } as const;
export const FIRST_NOTEBOOK = { id: 'notebook', name: 'Notebook' } as const;

export interface LayoutState {
  /** `<data dir>/working-notes.db` exists. */
  readonly legacyDatabase: boolean;
  /** `<data dir>/files` exists. */
  readonly legacyFiles: boolean;
  /** Snapshot folders directly in `<data dir>/Backups`. */
  readonly legacySnapshots: readonly string[];
  /** Notebooks with a notebook.json. */
  readonly notebookIds: readonly string[];
  /** The legacy notebook's folder already has a database or files (a move was interrupted, or both exist). */
  readonly legacyTargetHasDatabase: boolean;
  readonly legacyTargetHasFiles: boolean;
  readonly defaultId: string | null;
}

export type LayoutStep =
  | { readonly kind: 'create-notebook'; readonly id: string; readonly name: string }
  | { readonly kind: 'move-database' }
  | { readonly kind: 'move-files' }
  | { readonly kind: 'move-snapshot'; readonly snapshotId: string }
  | { readonly kind: 'set-default'; readonly id: string };

export const planLayout = (state: LayoutState): Result<readonly LayoutStep[]> => {
  const target = `Notebooks/${LEGACY_NOTEBOOK.id}`;
  if (state.legacyDatabase && state.legacyTargetHasDatabase) {
    return err(new Error(`Both working-notes.db and ${target}/working-notes.db exist in the data directory. Move one of them aside, then try again.`));
  }
  if (state.legacyFiles && state.legacyTargetHasFiles) {
    return err(new Error(`Both files/ and ${target}/files/ exist in the data directory. Move one of them aside, then try again.`));
  }

  const steps: LayoutStep[] = [];
  const ids = new Set(state.notebookIds);
  const hasLegacy = state.legacyDatabase || state.legacyFiles || state.legacySnapshots.length > 0;

  if (hasLegacy) {
    if (!ids.has(LEGACY_NOTEBOOK.id)) {
      steps.push({ kind: 'create-notebook', ...LEGACY_NOTEBOOK });
      ids.add(LEGACY_NOTEBOOK.id);
    }
    if (state.legacyDatabase) steps.push({ kind: 'move-database' });
    if (state.legacyFiles) steps.push({ kind: 'move-files' });
    for (const snapshotId of state.legacySnapshots) steps.push({ kind: 'move-snapshot', snapshotId });
  } else if (ids.size === 0) {
    steps.push({ kind: 'create-notebook', ...FIRST_NOTEBOOK });
    ids.add(FIRST_NOTEBOOK.id);
  }

  if (!state.defaultId || !ids.has(state.defaultId)) {
    const preferred = hasLegacy ? LEGACY_NOTEBOOK.id : ids.has(FIRST_NOTEBOOK.id) ? FIRST_NOTEBOOK.id : [...ids].sort()[0];
    if (preferred) steps.push({ kind: 'set-default', id: preferred });
  }

  return ok(steps);
};
