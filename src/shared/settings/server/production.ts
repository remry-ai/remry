import { LICENSE_PUBLIC_KEY } from '../../license/public-key';
import { appDataDir } from './app-dirs';
import type { ServerSettings } from './types';

export const production: ServerSettings = {
  dataDir: appDataDir(),
  licensePublicKey: LICENSE_PUBLIC_KEY
};
