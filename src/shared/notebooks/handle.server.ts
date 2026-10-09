// Picks the notebook for each request and puts it on `event.locals.notebook`:
// `?notebook=<id>` switches (and is remembered in a cookie), then the cookie, then the default.

import type { Handle } from '@sveltejs/kit';
import { TRPC_BASE_PATH } from '$shared/trpc/config';
import { resolveCurrentNotebook } from './current.server';
import { NOTEBOOK_COOKIE, NOTEBOOK_PARAM } from './id';

const COOKIE_OPTIONS = { path: '/', httpOnly: true, sameSite: 'strict', secure: false, maxAge: 60 * 60 * 24 * 400 } as const;

export const notebookHandle: Handle = async ({ event, resolve }) => {
  const requested = event.url.searchParams.get(NOTEBOOK_PARAM);
  const notebook = await resolveCurrentNotebook({ explicit: requested, remembered: event.cookies.get(NOTEBOOK_COOKIE) });
  if (!notebook.ok) {
    return new Response(notebook.error.message, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  event.locals.notebook = notebook.value;
  if (requested === null) return resolve(event);

  const isPage = event.request.method === 'GET' && !event.isDataRequest && !event.url.pathname.startsWith(TRPC_BASE_PATH);
  if (!isPage) {
    event.cookies.set(NOTEBOOK_COOKIE, notebook.value.id, COOKIE_OPTIONS);
    return resolve(event);
  }

  // Drop the parameter from the address bar, so reloading an old link later
  // doesn't switch back after the user has picked another notebook.
  const url = new URL(event.url);
  url.searchParams.delete(NOTEBOOK_PARAM);
  return new Response(null, {
    status: 303,
    headers: {
      location: `${url.pathname}${url.search}`,
      'set-cookie': event.cookies.serialize(NOTEBOOK_COOKIE, notebook.value.id, COOKIE_OPTIONS)
    }
  });
};
