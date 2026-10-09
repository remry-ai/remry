import { LICENSE_PUBLIC_KEY } from '../../license/public-key';
import { appDataDir } from './app-dirs';
import type { ServerSettings } from './types';

// Dev and production share one notebook, like an installed app.
export const development: ServerSettings = {
  dataDir: appDataDir(),
  licensePublicKey: LICENSE_PUBLIC_KEY
};
