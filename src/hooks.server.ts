// Root server hooks. `init` puts the data directory in the notebook layout and
// prepares the default notebook's database before the first request; `handle`
// sequences the local-only guard, the notebook picker, the tRPC handle, and security headers.

import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { ensureDatabase } from '$shared/db/bootstrap.server';
import { resolveCurrentNotebook } from '$shared/notebooks/current.server';
import { notebookHandle } from '$shared/notebooks/handle.server';
import { trpcHandle } from '$shared/trpc/handler';
import { LOCAL_HEADER, TRPC_BASE_PATH } from '$shared/trpc/config';
import { allowRequest, isRemoteRequest } from '$shared/remote/tailnet';
import { readTailnetHost } from '$shared/remote/store.server';

/**
 * There is no auth, so the network boundary is the security boundary:
 * - reject any request whose hostname isn't loopback (defeats DNS rebinding), unless it's the
 *   tailnet name the user turned on (`remoteAccess.set`, served by `tailscale serve`), and
 *   never one that came in through Tailscale Funnel ($shared/remote/tailnet.ts)
 * - require LOCAL_HEADER on the API (defeats cross-site request forgery)
 */
const localOnlyGuard: Handle = async ({ event, resolve }) => {
  const request = {
    hostname: event.url.hostname,
    pathname: event.url.pathname,
    header: (name: string) => event.request.headers.get(name)
  };
  // The setting is read only for a request off loopback, so turning it off takes effect at once.
  const tailnetHost = isRemoteRequest(request) ? await readTailnetHost() : null;
  if (!allowRequest(request, tailnetHost, { basePath: TRPC_BASE_PATH, localHeader: LOCAL_HEADER })) {
    return new Response('Forbidden', { status: 403 });
  }
  return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  return response;
};

export const init: ServerInit = async () => {
  const notebook = await resolveCurrentNotebook({});
  if (!notebook.ok) throw notebook.error;
  await ensureDatabase(notebook.value.id);
};

export const handle = sequence(localOnlyGuard, notebookHandle, trpcHandle, securityHeaders);
