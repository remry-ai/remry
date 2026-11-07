// Whether this computer has Remry Pro, from the license the /app layout loads.

import { isProActive, type LicenseStatus } from '$shared/types/license';

/** True while the page's data carries an active license. */
export const hasPro = (data: Readonly<Record<string, unknown>>): boolean => {
  const license = data['license'] as LicenseStatus | undefined;
  return license !== undefined && isProActive(license);
};
