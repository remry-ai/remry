// Files uploaded as links, from the browser: uploading one (link.upload) and writing its doc or
// page from it with the local Claude (link.convert, then link.conversion until it's done).

import { trpc } from '$shared/trpc/client';
import { submitOrThrow } from '$lib/ui/submit';
import { fileToBase64 } from '$lib/common/use-doc-handlers';
import { convertAndWait } from '$lib/doc/convert-source';
import { fileLinkKey } from '$shared/utils/file-links';

export type FileHolder = 'DOC' | 'PAGE';

/** Uploads the file as a link on the doc or page; returns the new link's id. */
export const uploadFileLink = async (entityType: FileHolder, entityId: string, file: File): Promise<string> => {
  const dataBase64 = await fileToBase64(file);
  const { id } = await submitOrThrow(() => trpc().link.upload.mutate({ entityType, entityId, fileName: file.name, dataBase64 }));
  return id;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Writes the link's doc or page from its file; a warning when `claude` isn't installed, else null. Throws when it fails. */
export const convertFileLinkAndWait = (linkId: string, entityType: FileHolder, entityId: string): Promise<string | null> =>
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
