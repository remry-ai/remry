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
      'cache-control': 'no-store'
    }
  });
};
