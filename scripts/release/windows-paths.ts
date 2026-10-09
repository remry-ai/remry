// Pure: paths Windows can't check out. A reserved device name (con, prn, aux, nul,
// com1–9, lpt1–9) is refused as any path segment, with or without an extension, and
// so are the characters < > : " | ? * and a segment ending in a dot or a space.
// `src/api/aux/` once stopped the Windows release build at checkout.

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const BAD_CHARS = /[<>:"|?*]/;

/** The paths among `paths` (forward slashes, as git lists them) that Windows can't check out. */
export const windowsUnsafePaths = (paths: readonly string[]): readonly string[] =>
  paths.filter((path) => path.split('/').some((segment) => RESERVED.test(segment) || BAD_CHARS.test(segment) || /[. ]$/.test(segment)));
