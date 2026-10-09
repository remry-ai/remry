// Cross-boundary constants. Safe for client and server import.
export const TRPC_BASE_PATH = '/api/trpc';

/**
 * Required on every API request. Browsers cannot attach a custom header to a
 * cross-origin request without a CORS preflight, which this server never
 * approves, so hostile web pages cannot drive the local API (see hooks.server.ts).
 */
export const LOCAL_HEADER = 'x-remry';
