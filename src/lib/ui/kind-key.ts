// The key a group kind or person relation kind gets from its name, until the user types one.

/** "Home item" → HOME_ITEM. */
export const kindKeyFromName = (name: string): string =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^[^A-Z]+/, '').replace(/_+$/, '').slice(0, 40);
