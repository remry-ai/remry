// Fetch adapter handler. Mounted in hooks.server.ts at TRPC_BASE_PATH.

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Handle } from '@sveltejs/kit';
import { appRouter } from './router';
import { createContext } from './context.server';
import { TRPC_BASE_PATH } from './config';

export { TRPC_BASE_PATH };

export const trpcHandle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith(TRPC_BASE_PATH)) {
    const response = await fetchRequestHandler({
      endpoint: TRPC_BASE_PATH,
      req: event.request,
      router: appRouter,
      createContext: () => createContext({ event }),
      onError({ path, error }) {
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          console.error(`tRPC error on ${path}:`, error);
        }
      }
    });
    // Never let the CDN cache API responses. Mutations must always hit origin.
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  return resolve(event);
};
