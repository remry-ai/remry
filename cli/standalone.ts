// Entry point of the standalone `remry` binary that scripts/release/build.ts compiles.
// It runs the same commands as bin/remry with Bun built in, so a machine needs no
// clone. The UI's static files are embedded in it; the migrations and VERSION sit next
// to it (the plugin shim installs them together under <data dir>/App/<version>).

import { dirname, join } from 'node:path';
import type { StaticFiles, SvelteKitServer } from './app-server';

export interface StandaloneApp {
  /** Loads the built SvelteKit server. A lazy import, so only `remry app` pays for it. */
  readonly loadServer: () => Promise<SvelteKitServer>;
  /** The UI's static files, embedded by scripts/release/build.ts. */
  readonly staticFiles: StaticFiles;
}

export const runStandalone = async (app: StandaloneApp): Promise<void> => {
  const resources = dirname(process.execPath);
  // Read by cli/main.ts, cli/mcp.ts and scripts/backup/main.ts, which otherwise run from a clone.
  process.env['REMRY_STANDALONE'] = '1';
  process.env['REMRY_MIGRATIONS_DIR'] ??= join(resources, 'migrations');

  switch (process.argv[2]) {
    case 'mcp':
      await import('./mcp');
      return;
    case 'backup':
      // scripts/backup/main.ts reads its own arguments from argv[2].
      process.argv.splice(2, 1);
      await import('../scripts/backup/main');
      return;
    case 'install':
    case 'connect': {
      const { runDesktopCommand } = await import('./desktop');
      process.exit(await runDesktopCommand(process.argv[2], process.argv.slice(3)));
    }
    case 'app': {
      if (process.argv[3] === 'restart') {
        await import('./app-restart');
        return;
      }
      if (process.argv[3] === 'ensure') {
        const { runDesktopCommand } = await import('./desktop');
        process.exit(await runDesktopCommand('ensure', []));
      }
      const { serveApp } = await import('./app-server');
      // The shim installs VERSION beside the binary; release apps report it so a newer release can replace them.
      const version = process.env['REMRY_VERSION'] ?? (await Bun.file(join(resources, 'VERSION')).text().catch(() => 'unknown')).trim();
      await serveApp({ server: await app.loadServer(), staticFiles: app.staticFiles, version });
      return;
    }
    default:
      await import('./main');
  }
};
