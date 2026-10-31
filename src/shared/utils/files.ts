// URL for a locally stored file, served by src/routes/files/[...key]/+server.ts.
export const fileUrl = (key: string): string =>
  `/files/${key.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Whether a doc's source file is one Claude can read (a PDF, an image or text), so it can be
 * converted: those are stored as `source-<uuid>.<ext>`, and any other file as `file-<uuid>.<ext>`.
 */
export const isReadableSourceKey = (key: string | null | undefined): boolean =>
  !!key && /(^|\/)source-[^/]+$/.test(key);
