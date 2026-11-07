// A doc's or wiki page's body, checked before it's stored: markdown, a
// spreadsheet or a drawing (BodyType in $shared/types/body-types). Pure.

import { ok, err, type Result } from '$shared/utils';
import { validateChartBlocks } from '$shared/types/charts';
import type { BodyType } from '$shared/types/body-types';
import { parseSheetContent, readSheetContent } from '$shared/utils/sheet';
import { isEmptyDrawing, parseDrawingContent, readDrawingContent } from '$shared/utils/drawing';
import { refuseBlobUrls } from '$api/_images';

/**
 * Checks a body before it's stored and returns what to store: markdown as
 * given (its chart blocks valid), a sheet's JSON normalised (values filled
 * in, rows padded) so search and print can rely on its shape, or a drawing's
 * JSON (a skeleton or a scene, deleted elements dropped).
 */
export const prepareContent = (bodyType: BodyType, content: string): Result<string> => {
  if (bodyType === 'doc') {
    const images = refuseBlobUrls(content);
    if (!images.ok) return err(images.error);
    const charts = validateChartBlocks(content);
    return charts.ok ? ok(content) : err(charts.error);
  }
  if (bodyType === 'drawing') {
    const drawing = parseDrawingContent(content);
    return drawing.ok ? ok(JSON.stringify(drawing.value)) : err(drawing.error);
  }
  const sheet = parseSheetContent(content);
  return sheet.ok ? ok(JSON.stringify(sheet.value)) : err(sheet.error);
};

/** A document with no text, a sheet with no filled cells, or a drawing with nothing drawn. */
export const isEmptyBody = (bodyType: BodyType, content: string): boolean => {
  if (bodyType === 'doc') return content.trim() === '';
  if (bodyType === 'drawing') return isEmptyDrawing(readDrawingContent(content));
  return readSheetContent(content).data.every((row) => row.every((cell) => cell.trim() === ''));
};
