// Files uploaded as links, from the browser: uploading one (link.upload), saving its text with the
// local Claude (link.transcribe), and writing its doc or page from it (link.convert, which saves
// the text too), each followed by link.conversion until it's done.

import { trpc } from '$shared/trpc/client';
import { submitOrThrow } from '$lib/ui/submit';
import { fileToBase64 } from '$lib/common/use-doc-handlers';
import { convertAndWait } from '$lib/doc/convert-source';
import { fileLinkKey, type FileLinkHolder } from '$shared/utils/file-links';


/** Uploads the file as a link on the entity; returns the new link's id. */
export const uploadFileLink = async (entityType: FileLinkHolder, entityId: string, file: File): Promise<string> => {
  const dataBase64 = await fileToBase64(file);
  const { id } = await submitOrThrow(() => trpc().link.upload.mutate({ entityType, entityId, fileName: file.name, dataBase64 }));
  return id;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Saves the file link's text with the local Claude, so Claude reads that instead of the PDF; a
 * warning when `claude` isn't installed, else null. Throws when it fails.
 */
export const transcribeFileLinkAndWait = (linkId: string): Promise<string | null> =>
  convertAndWait({
    start: () => submitOrThrow(() => trpc().link.transcribe.mutate({ id: linkId })),
    status: () => submitOrThrow(() => trpc().link.conversion.query({ entityType: 'LINK', entityId: linkId })),
    wait
  });

/** After an upload that writes no page: saves the file's text in the background. It's only a saving, so a failure is left quiet. */
export const transcribeInBackground = (linkId: string): void => {
  transcribeFileLinkAndWait(linkId).catch(() => undefined);
};

/** Writes the link's doc or page from its file; a warning when `claude` isn't installed, else null. Throws when it fails. */
export const convertFileLinkAndWait = (linkId: string, entityType: 'DOC' | 'PAGE', entityId: string): Promise<string | null> =>
  convertAndWait({
    start: () => submitOrThrow(() => trpc().link.convert.mutate({ id: linkId })),
    status: () => submitOrThrow(() => trpc().link.conversion.query({ entityType, entityId })),
    wait
  });

export interface LinkLike {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
}

/** The newest file link among an entity's links (`link.list` lists newest first), or null. */
export const newestFileLink = (links: readonly LinkLike[]): LinkLike | null =>
  links.find((l) => fileLinkKey(l.url) !== null) ?? null;
