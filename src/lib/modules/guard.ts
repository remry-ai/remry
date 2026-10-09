// Route guard for pages a module owns (/app/goals, /app/orgmap): a notebook
// without that module goes home instead.

import { redirect } from '@sveltejs/kit';
import { notebookModel } from '$shared/modules/model';
import type { NotebookInfo } from '$shared/types/notebook';

export const requireRoute = (notebook: NotebookInfo, pathname: string): void => {
  if (notebookModel(notebook.profile).routeOwner(pathname)) redirect(307, '/app');
};
