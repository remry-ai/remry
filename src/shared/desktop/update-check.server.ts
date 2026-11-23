// The automatic update check's setting in settings.json (update-check.ts). The desktop shell
// reads it from `remry install` and sets it with `remry updates on|off` (cli/desktop.ts).

import { settings } from '../settings/server/index.server';
import { readRootSettings, updateRootSettings } from '../settings/server/root-settings.server';
import { UPDATE_CHECK_KEY, checksForUpdates, storedUpdateCheck } from './update-check';

export const readUpdateCheck = async (): Promise<boolean> => checksForUpdates((await readRootSettings(settings))[UPDATE_CHECK_KEY]);

export const setUpdateCheck = async (enabled: boolean): Promise<boolean> => {
  await updateRootSettings(settings, { [UPDATE_CHECK_KEY]: storedUpdateCheck(enabled) });
  return readUpdateCheck();
};
