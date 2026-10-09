import { TEST_LICENSE_PUBLIC_KEY } from '../../license/test-key';
import type { ServerSettings } from './types';

export const test: ServerSettings = {
  dataDir: './data/test',
  licensePublicKey: TEST_LICENSE_PUBLIC_KEY
};
