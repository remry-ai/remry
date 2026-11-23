// Whether the desktop app checks GitHub for a new release when it opens: `checkForUpdates`
// in <data dir>/settings.json. On unless it's false, so an IT team can turn it off by writing
// that one key. "Check for Updates…" still works when it's off. Pure.

export const UPDATE_CHECK_KEY = 'checkForUpdates';

/** Pure. The stored value as a setting: anything but `false` means on. */
export const checksForUpdates = (stored: unknown): boolean => stored !== false;

/** Pure. What to store for a choice: false when off, nothing (the default) when on. */
export const storedUpdateCheck = (enabled: boolean): false | undefined => (enabled ? undefined : false);
