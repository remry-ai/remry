// A doc's or wiki page's body as markdown, for anything that reads text: a
// spreadsheet as a table of the values its cells showed, a drawing as a list
// of its text, a document as it is; and whether a body is empty. Pure; used by
// search.recall, entity.convert (into a note), peeks, print, and the server's
// and browser's checks of an empty body.

import { readSheetContent, sheetToMarkdown } from './sheet';
import { drawingToMarkdown, isEmptyDrawing, readDrawingContent } from './drawing';
import type { BodyType } from '$shared/types/body-types';

export const bodyMarkdown = (bodyType: string, content: string): string => {
  if (bodyType === 'sheet') return sheetToMarkdown(readSheetContent(content));
  if (bodyType === 'drawing') return drawingToMarkdown(readDrawingContent(content));
  return content;
};

/** A document with no text, a sheet with no filled cells, or a drawing with nothing drawn. */
export const isEmptyBody = (bodyType: BodyType, content: string): boolean => {
  if (bodyType === 'doc') return content.trim() === '';
  if (bodyType === 'drawing') return isEmptyDrawing(readDrawingContent(content));
  return readSheetContent(content).data.every((row) => row.every((cell) => cell.trim() === ''));
};
