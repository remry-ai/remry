// URL for a locally stored file, served by src/routes/files/[...key]/+server.ts.
export const fileUrl = (key: string): string =>
  `/files/${key.split('/').map(encodeURIComponent).join('/')}`;
