// `remry app restart`: stops the running Remry app, whatever version it is,
// and starts it again in the background. From a release, and from a clone (bin/remry).

import { resolve } from 'node:path';
import { appUrl, currentAppOwner, restartApp } from './app-launch';

try {
  const { stopped } = await restartApp(currentAppOwner(resolve(import.meta.dir, '..')));
  console.log(`${stopped ? 'Restarted' : 'Started'} Remry at ${appUrl(null)}`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
