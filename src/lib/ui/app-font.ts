// The app's one font and its text size: the only place to change them. Everything follows from
// here: the interface, fields, docs, notes, code, charts, diagrams and exported PDFs.
//
// To change the size or line spacing, change `textSizePx` or `lineHeight` below.
//
// To use another font (any Google font works; the packages bundle it, so nothing is fetched):
//   1. `bun add @fontsource-variable/<font> @expo-google-fonts/<font>`, and remove the old two.
//   2. Point the imports below at the new packages: the web font's CSS for the screen, and its
//      static Regular, Bold, Italic and Bold Italic .ttf files for PDFs.
//   3. Set `family` to its name (the @fontsource-variable CSS names it "<Font> Variable").
//   4. Set `pdf.lineHeightEm` from `bun run font:metrics <the Regular .ttf>`.

import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import regular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url';
import bold from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf?url';
import italic from '@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf?url';
import boldItalic from '@expo-google-fonts/inter/700Bold_Italic/Inter_700Bold_Italic.ttf?url';

export interface AppFont {
  /** The CSS font stack: the font, then fallbacks. */
  readonly family: string;
  /** The size of all text you write or read: fields, labels, docs, notes, chat, spreadsheet cells. */
  readonly textSizePx: number;
  /** Line spacing of written content, as a multiple of the text size. */
  readonly lineHeight: number;
  readonly pdf: {
    /** The font's static files, by style, for pdfmake (which can't use the variable web font). */
    readonly files: { readonly normal: string; readonly bold: string; readonly italics: string; readonly bolditalics: string };
    /** The font's own line height in ems ((ascender − descender + line gap) / units per em). */
    readonly lineHeightEm: number;
  };
}

export const APP_FONT: AppFont = {
  family: "'Inter Variable', 'Inter', system-ui, sans-serif",
  textSizePx: 13,
  lineHeight: 1.7,
  pdf: {
    files: { normal: regular, bold, italics: italic, bolditalics: boldItalic },
    lineHeightEm: 1.21
  }
};

/** The CSS tokens this sets on every page (in the root layout): --font-text, --fs-text, --lh-text. */
export const appFontCss = (font: AppFont = APP_FONT): string =>
  `:root{--font-text:${font.family};--fs-text:${font.textSizePx}px;--lh-text:${font.lineHeight}}`;
