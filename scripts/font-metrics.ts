// Prints a font's own line height in ems, for `pdf.lineHeightEm` in src/lib/ui/app-font.ts:
// (ascender − descender + line gap) / units per em, from its hhea and head tables.
//   bun run font:metrics node_modules/@expo-google-fonts/<font>/400Regular/<Font>_400Regular.ttf

import { readFileSync } from 'node:fs';

/** The line height in ems of a TrueType or OpenType font file. */
export const lineHeightEm = (font: Uint8Array): number => {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i;
    const tag = String.fromCharCode(...font.subarray(at, at + 4));
    tables.set(tag, view.getUint32(at + 8));
  }
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  if (head === undefined || hhea === undefined) throw new Error('Not a TrueType or OpenType font (no head or hhea table)');
  const unitsPerEm = view.getUint16(head + 18);
  const ascender = view.getInt16(hhea + 4);
  const descender = view.getInt16(hhea + 6);
  const lineGap = view.getInt16(hhea + 8);
  return (ascender - descender + lineGap) / unitsPerEm;
};

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: bun run font:metrics <font.ttf>');
    process.exit(1);
  }
  console.log(`lineHeightEm: ${Math.round(lineHeightEm(readFileSync(file)) * 1000) / 1000}`);
}
