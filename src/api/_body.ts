// A doc's or wiki page's body, checked before it's stored: markdown, a
// spreadsheet or a drawing (BodyType in $shared/types/body-types). Pure.

import { ok, err, type Result } from '$shared/utils';
import { validateChartBlocks } from '$shared/types/charts';
import { asBodyType, BODY_NAMES, type BodyType } from '$shared/types/body-types';
import { parseSheetContent } from '$shared/utils/sheet';
import { parseDrawingContent } from '$shared/utils/drawing';
import { isEmptyBody } from '$shared/utils/body';
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


/** Docs and pages, as messages name them. */
export type BodyHolder = 'page' | 'doc';

export interface BodyUpdate {
  /** The body type after the update. */
  readonly bodyType: BodyType;
  /** Whether the update changes the body type. */
  readonly typeChanged: boolean;
  /** The content to store, checked and normalised; undefined when it isn't changing. */
  readonly content?: string;
}

/**
 * A doc's or page's body update, checked the same way for both: the type changes only while
 * the body is empty, only a document takes a prompt (a sync doc or page), and new content is
 * checked as its type. A type change with no content stores that type's empty body.
 */
export const planBodyUpdate = (
  holder: BodyHolder,
  existing: { readonly bodyType: string; readonly content: string; readonly prompt: string | null },
  input: { readonly bodyType?: BodyType; readonly content?: string; readonly prompt?: string | null }
): Result<BodyUpdate> => {
  const currentType = asBodyType(existing.bodyType);
  const bodyType = input.bodyType ?? currentType;
  const typeChanged = bodyType !== currentType;
  if (typeChanged && !isEmptyBody(currentType, existing.content)) {
    return err(new Error(`This ${holder} already has content as a ${BODY_NAMES[currentType]}, so it can't become a ${BODY_NAMES[bodyType]}. Clear its content first, or make a new ${holder} (${holder === 'doc' ? 'doc.add' : 'page.create'} --bodyType ${bodyType}).`));
  }
  const prompt = input.prompt === undefined ? existing.prompt : input.prompt;
  if (bodyType !== 'doc' && prompt?.trim()) {
    return err(new Error(`A ${BODY_NAMES[bodyType]} ${holder} can't be a sync ${holder}: only a document's text is rewritten from its sources.`));
  }
  if (input.content === undefined && !typeChanged) return ok({ bodyType, typeChanged });
  const content = prepareContent(bodyType, input.content ?? '');
  return content.ok ? ok({ bodyType, typeChanged, content: content.value }) : err(content.error);
};

/** The text whose links become mentions and whose images are kept: a document's; a spreadsheet or drawing has none. */
export const linkedText = (bodyType: BodyType, content: string): string => (bodyType === 'doc' ? content : '');

/**
 * Refuses what only a document can do (Sync now, writing it from a file) for a spreadsheet or
 * drawing, in the same words for docs and pages.
 */
export const requireDocument = (holder: BodyHolder, bodyType: string, action: string): Result<void> => {
  const type = asBodyType(bodyType);
  return type === 'doc' ? ok(undefined) : err(new Error(`A ${BODY_NAMES[type]} ${holder} can't be ${action}.`));
};
