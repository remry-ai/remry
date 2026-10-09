// SvelteKit-free tRPC client factory. Shared by the browser/SSR client wrapper
// (`client.ts`) and standalone processes (e.g. the CLI) that cannot import
// SvelteKit virtual modules like `$app/environment`.

import { createTRPCClient, httpBatchLink, type CreateTRPCClient } from '@trpc/client';
import type { AppRouter } from './router';
import { LOCAL_HEADER, TRPC_BASE_PATH } from './config';

export interface TrpcClientOptions {
  /** Endpoint URL. Defaults to the app-relative TRPC_BASE_PATH. */
  readonly url?: string;
  /** Custom fetch (SvelteKit `fetch` for SSR). */
  readonly fetch?: typeof globalThis.fetch;
}

export const createTrpcClient = (
  options: TrpcClientOptions = {}
): CreateTRPCClient<AppRouter> =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: options.url ?? TRPC_BASE_PATH,
        fetch: options.fetch,
        headers: () => ({ [LOCAL_HEADER]: '1' })
      })
    ]
  });
