// Images pasted or dropped where the doc editor isn't: the title box (a new doc opens
// with it focused, so a paste lands there) and the Markdown tab's textarea. A text box
// drops an image without a word, so these put it in the doc body instead, as the editor would.

/** Image files in a paste or drop. WebKit can leave `files` empty and list the image only in `items`. */
export const imageFilesIn = (data: DataTransfer | null | undefined): readonly File[] => {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  const fromItems = files.length > 0
    ? files
    : Array.from(data.items ?? []).flatMap((item) => {
        const file = item.kind === 'file' ? item.getAsFile() : null;
        return file ? [file] : [];
      });
  return fromItems.filter((file) => file.type.startsWith('image/'));
};

export interface PastedImage {
  readonly url: string;
  readonly name: string;
}

/** `![name](url)`, with the characters that would end the alt text left out. */
export const imageMarkdown = ({ url, name }: PastedImage): string => `![${name.replace(/[[\]\n]/g, '')}](${url})`;

/** The images as their own paragraphs at `at` (the end by default). */
export const insertImages = (markdown: string, images: readonly PastedImage[], at = markdown.length): string => {
  if (images.length === 0) return markdown;
  const before = markdown.slice(0, at).replace(/\s+$/, '');
  const after = markdown.slice(at).replace(/^\s+/, '');
  const block = images.map(imageMarkdown).join('\n\n');
  return [before, block, after].filter((part) => part !== '').join('\n\n');
};
