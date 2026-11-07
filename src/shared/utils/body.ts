// A doc's or wiki page's body as markdown, for anything that reads text: a
// spreadsheet as a table of the values its cells showed, a drawing as a list
// of its text, a document as it is. Pure; used by search.recall, entity.convert
// (into a note), peeks and print.

import { readSheetContent, sheetToMarkdown } from './sheet';
import { drawingToMarkdown, readDrawingContent } from './drawing';

export const bodyMarkdown = (bodyType: string, content: string): string => {
  if (bodyType === 'sheet') return sheetToMarkdown(readSheetContent(content));
  if (bodyType === 'drawing') return drawingToMarkdown(readDrawingContent(content));
  return content;
};
