import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { trpc } from '$shared/trpc/client';
import { exportFormatOf } from '$lib/doc/print-options';

// A project's export: markdown of the project, its docs and sub-projects (a project has no one
// body to print, so no PDF). The tree itself loads in the browser (`MarkdownExportPanel`).
export const load: PageServerLoad = async ({ params, url, fetch }) => {
  const project = await trpc(fetch).project.get.query({ id: params.id });
  if (!project.ok) error(404, 'Project not found');
  const format = exportFormatOf(url.searchParams);
  return {
    project: { id: project.value.id, name: project.value.name, path: project.value.path },
    format: format === 'pdf' ? ('markdown' as const) : format
  };
};
