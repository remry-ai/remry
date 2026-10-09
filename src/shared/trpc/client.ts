// tRPC client. Singleton on the browser, fresh per request on the server.

import { browser } from '$app/environment';
import type { CreateTRPCClient } from '@trpc/client';
import type { AppRouter } from './router';
import { createTrpcClient } from './client-core';

let browserClient: CreateTRPCClient<AppRouter> | undefined;

/**
 * Get a tRPC client. Pass the SvelteKit `fetch` from load functions for SSR;
 * in the browser, reuse a singleton.
 */
export const trpc = (fetch?: typeof globalThis.fetch): CreateTRPCClient<AppRouter> => {
  if (browser) {
    browserClient ??= createTrpcClient();
    return browserClient;
  }
  return createTrpcClient({ fetch });
};
