// Excalidraw gives each of its fonts two sources: the app's own copy
// (window.EXCALIDRAW_ASSET_PATH, served by scripts/vite/excalidraw-fonts.ts)
// and a fallback on esm.sh, its CDN. The CSP blocks the CDN, and the app makes
// no outside requests, so every fallback only logged an error. This keeps the
// app's own source and drops the CDN one. A font the app doesn't ship
// (Xiaolai, the CJK one) becomes `local(...)`: the system's font, no request.
// Pure.

const EXCALIDRAW_CDN = 'esm.sh/@excalidraw/';
const UNSHIPPED = ['/fonts/Xiaolai/'];

/** A FontFace source with Excalidraw's CDN fallbacks taken out. Other sources pass unchanged. */
export const localFontSource = (family: string, source: string): string => {
  if (!source.includes(EXCALIDRAW_CDN)) return source;
  const kept = source
    .split(/,\s*(?=url\()/)
    .map((part) => part.trim())
    .filter((part) => !part.includes(EXCALIDRAW_CDN) && !UNSHIPPED.some((path) => part.includes(path)));
  return kept.length > 0 ? kept.join(', ') : `local("${family.replace(/"/g, '')}")`;
};

let installed = false;

/** Makes every FontFace made from now on use localFontSource. Once per page. */
export const keepFontsLocal = (): void => {
  if (installed || typeof window === 'undefined' || !window.FontFace) return;
  installed = true;
  const Native = window.FontFace;
  class LocalFontFace extends Native {
    constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
      super(family, typeof source === 'string' ? localFontSource(family, source) : source, descriptors);
    }
  }
  window.FontFace = LocalFontFace;
};
