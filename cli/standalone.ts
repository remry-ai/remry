// Entry point of the standalone `remry` binary that scripts/release/build.ts compiles.
// It runs the same commands as bin/remry with Bun built in, so a machine needs no
// clone. The UI's static files are embedded in it; the migrations and VERSION sit next
// to it, or in Contents/Resources of the macOS app (cli/release-resources.ts).

import { dirname, join } from 'node:path';
import { findReleaseFile, realBinaryPath } from './release-resources';
import type { StaticFiles, SvelteKitServer } from './app-server';

export interface StandaloneApp {
  /** Loads the built SvelteKit server. A lazy import, so only `remry app` pays for it. */
  readonly loadServer: () => Promise<SvelteKitServer>;
  /** The UI's static files, embedded by scripts/release/build.ts. */
  readonly staticFiles: StaticFiles;
}

export const runStandalone = async (app: StandaloneApp): Promise<void> => {
  // Read by cli/main.ts, cli/mcp.ts and scripts/backup/main.ts, which otherwise run from a clone.
  process.env['REMRY_STANDALONE'] = '1';
  process.env['REMRY_MIGRATIONS_DIR'] ??= findReleaseFile('migrations') ?? join(dirname(realBinaryPath()), 'migrations');

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
    case 'uninstall':
    case 'updates':
    case 'connect': {
      const { runDesktopCommand } = await import('./desktop');
      return process.exit(await runDesktopCommand(process.argv[2], process.argv.slice(3)));
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
      // Release apps report their version, so a newer release can replace them.
      const versionFile = findReleaseFile('VERSION');
      const version = process.env['REMRY_VERSION'] ?? (versionFile ? (await Bun.file(versionFile).text().catch(() => 'unknown')).trim() : 'unknown');
      await serveApp({ server: await app.loadServer(), staticFiles: app.staticFiles, version });
      return;
    }
    default:
      await import('./main');
  }
};
