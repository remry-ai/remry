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

// Every entity whose page shows links keeps its files in a folder of its own, deleted with it.
const FILE_FOLDERS: Readonly<Partial<Record<string, string>>> = {
  DOC: 'docs', PAGE: 'pages', PERSON: 'people', GROUP: 'groups', PROJECT: 'projects', GOAL: 'goals'
};

/** The types that can hold a file uploaded as a link: every one whose page shows links. */
export const FILE_LINK_HOLDERS = ['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE', 'DOC'] as const;
export type FileLinkHolder = (typeof FILE_LINK_HOLDERS)[number];

/** The folder an entity keeps its own files in (a doc's or page's images, and files uploaded as links), or null for a type that has none. */
export const entityFileFolder = (entityType: string, entityId: string): string | null => {
  const folder = FILE_FOLDERS[entityType];
  return folder ? `${folder}/${entityId}` : null;
};
