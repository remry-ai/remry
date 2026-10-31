// Serves locally stored files (doc PDFs, branding images) from the current notebook's files folder.
// The storage client rejects keys that resolve outside the files root.

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRegistry } from '$shared/registry.server';

export const GET: RequestHandler = async ({ params, locals }) => {
  const file = await getRegistry(locals.notebook.id).storage.readObject(params.key);
  if (!file) error(404, 'Not found');

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'content-type': file.contentType,
      'cache-control': 'no-store',
      // The browser takes the type as given, so a text file is never read as HTML.
      'x-content-type-options': 'nosniff',
      // A file the app doesn't show (a doc's Word or zip source) downloads rather than opening.
      ...(file.contentType === 'application/octet-stream' && { 'content-disposition': 'attachment' })
    }
  });
};
