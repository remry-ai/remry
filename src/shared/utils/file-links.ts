// A file uploaded as a link ("+ Add link", "or upload a file"): a row in the link table whose
// address points at the file in the notebook's files folder, `storage://<key>`, the form a doc's
// or page's images take in their text. It shows, opens and goes like any other link. Pure.

import { fileUrl } from './files';

const PREFIX = 'storage://';

/** The link address for a stored file. */
export const fileLinkUrl = (key: string): string => `${PREFIX}${key}`;

/** The stored file a link points at, or null for an ordinary (outside) link. */
export const fileLinkKey = (url: string): string | null => (url.startsWith(PREFIX) ? url.slice(PREFIX.length) : null);

/** Where a link opens: the files route for a file link, else its own address. */
export const linkHref = (url: string): string => {
  const key = fileLinkKey(url);
  return key ? fileUrl(key) : url;
};

/** The folder an entity keeps its own files in (its images, and files uploaded as links), or null for a type that has none. */
export const entityFileFolder = (entityType: string, entityId: string): string | null =>
  entityType === 'DOC' ? `docs/${entityId}` : entityType === 'PAGE' ? `pages/${entityId}` : null;
