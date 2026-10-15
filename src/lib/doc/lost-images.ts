// Images saved as a browser's temporary blob: address. Before 0.16.11 a wiki page saved a
// pasted image's blob: address instead of uploading it, so the image died with the tab.
// The server now refuses content holding one, which left such a page unsaveable. Pure; the
// editor swaps the dead ones for a note on save, and `MarkdownRenderer` shows the same note.

/** What a lost image becomes, in the text and on screen. */
export const lostImageNote = (alt: string): string => {
  const name = alt.trim();
  return name ? `Image lost: ${name}. Paste it again.` : 'Image lost. Paste it again.';
};

const BLOB_IN_TEXT = /blob:[^\s)>"']+/g;

/** The distinct blob: addresses in markdown. */
export const blobUrlsIn = (markdown: string): readonly string[] => [...new Set(markdown.match(BLOB_IN_TEXT) ?? [])];

// `![alt](blob:… "title")`, with or without angle brackets around the address.
const BLOB_IMAGE = /!\[([^\]]*)\]\(\s*<?(blob:[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
// `[text](blob:…)`: a link to one.
const BLOB_LINK = /\[([^\]]*)\]\(\s*<?(blob:[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Emphasis markers in an image's name would end the note's italics early. */
const plain = (text: string): string => text.replace(/[*_`[\]]/g, '');

/**
 * Replaces each image (or link) whose blob: address is in `lost` with an italic note naming it,
 * so the content can be saved again. Other blob: addresses are left alone.
 */
export const replaceLostImages = (markdown: string, lost: ReadonlySet<string>): string => {
  if (!lost.size) return markdown;
  return markdown
    .replace(BLOB_IMAGE, (match, alt: string, url: string) => (lost.has(url) ? `*${lostImageNote(plain(alt))}*` : match))
    .replace(BLOB_LINK, (match, text: string, url: string) => (lost.has(url) ? text : match));
};
