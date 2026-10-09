// The open notebook's model (the core plus its profile's modules), from the app
// layout's data. Components ask it what the notebook has: `$model.has('goals')`,
// `$model.personFields`, `$model.nav`, `$model.personRelationKinds`.

import { derived, type Readable } from 'svelte/store';
import { page } from '$app/stores';
import { notebookModel, type NotebookModel } from '$shared/modules/model';
import type { NotebookInfo } from '$shared/types/notebook';

export const model: Readable<NotebookModel> = derived(page, ($page) =>
  notebookModel(($page.data as { notebook?: NotebookInfo }).notebook?.profile ?? 'work')
);
