// Serves the built UI from the standalone binary: static files embedded in it, and
// everything else (pages, the API, the guard in hooks.server.ts) through the
// SvelteKit server. Loopback only, like `bun run start`.

import { LOCAL_HEADER } from '../src/shared/trpc/config';

/** The parts of SvelteKit's generated `Server` (build/server/index.js) this uses. */
export interface SvelteKitServer {
  readonly init: (options: { readonly env: Record<string, string>; readonly read?: (file: string) => ReadableStream }) => Promise<void>;
  readonly respond: (request: Request, options: { readonly getClientAddress: () => string }) => Promise<Response>;
}

export const APP_HOST = '127.0.0.1';
export const APP_PORT = 5173;

const IMMUTABLE = '/_app/immutable/';

/**
 * The UI's static files, embedded in the binary: request path (`/_app/immutable/…`)
 * to the embedded file's path. A lookup, so a request can only reach a file that was
 * built into the release.
 */
export type StaticFiles = ReadonlyMap<string, string>;

/** The embedded file a request path names, or null if there is none or the path is malformed. */
export const staticFile = (files: StaticFiles, pathname: string): string | null => {
  try {
    return files.get(decodeURIComponent(pathname)) ?? null;
  } catch {
    return null;
  }
};

/** GET: the running app's version, so a newer release can tell it's stale (cli/app-launch.ts). */
export const APP_CONTROL_PATH = '/__remry/app';
/** POST: stops the app, so a newer release can replace it. */
export const APP_STOP_PATH = '/__remry/app/stop';
/** The same, in apps from before the renames (Wonos, then Working Notes), which a newer release still replaces. */
export const LEGACY_APP_CONTROL_PATHS: readonly string[] = ['/__wono/app', '/__wnotes/app'];
export const LEGACY_APP_STOP_PATHS: readonly string[] = ['/__wono/app/stop', '/__wnotes/app/stop'];
/** The local header those apps' stop endpoints require (ours is LOCAL_HEADER). */
export const LEGACY_LOCAL_HEADERS: readonly string[] = ['x-wono', 'x-working-notes'];

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

export type AppControl =
  | { readonly kind: 'version'; readonly body: { readonly version: string } }
  | { readonly kind: 'stop' }
  | { readonly kind: 'forbidden' };

/**
 * The app's own control requests, which bypass SvelteKit and so its guard in
 * hooks.server.ts. Stopping keeps both of that guard's rules: a loopback hostname
 * (blocks DNS rebinding) and the x-remry header (blocks cross-site requests).
 * Null for any other request.
 */
export const appControl = (request: Request, version: string): AppControl | null => {
  const url = new URL(request.url);
  if (url.pathname === APP_CONTROL_PATH && request.method === 'GET') return { kind: 'version', body: { version } };
  if (url.pathname !== APP_STOP_PATH) return null;
  const allowed = request.method === 'POST' && LOOPBACK_HOSTS.has(url.hostname) && request.headers.get(LOCAL_HEADER) === '1';
  return allowed ? { kind: 'stop' } : { kind: 'forbidden' };
};

export interface ServeAppOptions {
  readonly server: SvelteKitServer;
  readonly staticFiles: StaticFiles;
  readonly version: string;
  readonly port?: number;
}

export const serveApp = async (options: ServeAppOptions): Promise<void> => {
  const { server, staticFiles, version } = options;
  const port = options.port ?? Number(process.env['PORT'] || APP_PORT);
  await server.init({ env: process.env as Record<string, string>, read: (file) => {
      const embedded = staticFiles.get(`/${file}`);
      if (!embedded) throw new Error(`${file} isn't one of the app's static files`);
      return Bun.file(embedded).stream();
    } });

  try {
    const http = Bun.serve({
      hostname: APP_HOST,
      port,
      async fetch(request, bunServer) {
        const control = appControl(request, version);
        if (control?.kind === 'version') return Response.json(control.body);
        if (control?.kind === 'forbidden') return new Response('Forbidden', { status: 403 });
        if (control?.kind === 'stop') {
          console.error('Remry is stopping for a newer version.');
          // Answer first, then exit.
          setTimeout(() => process.exit(0), 100);
          return new Response(null, { status: 202 });
        }

        const url = new URL(request.url);
        if (request.method === 'GET' || request.method === 'HEAD') {
          const path = staticFile(staticFiles, url.pathname);
          if (path) {
            const headers: Record<string, string> = url.pathname.startsWith(IMMUTABLE) ? { 'cache-control': 'public, max-age=31536000, immutable' } : {};
            return new Response(Bun.file(path), { headers });
          }
        }
        return server.respond(request, { getClientAddress: () => bunServer.requestIP(request)?.address ?? APP_HOST });
      }
    });
    console.error(`Remry is running at http://${APP_HOST}:${http.port}/app`);
  } catch (error) {
    const inUse = (error as { code?: string }).code === 'EADDRINUSE';
    console.error(inUse ? `Something is already running on ${APP_HOST}:${port}. If it's Remry, open http://${APP_HOST}:${port}/app` : error);
    process.exit(1);
  }
  // Hourly snapshots while the app is open, on every platform (see scripts/backup/schedule.ts).
  const { startBackupSchedule } = await import('../scripts/backup/schedule');
  startBackupSchedule((message) => console.error(message));
};

