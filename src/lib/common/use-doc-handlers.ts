import { invalidateAll } from '$app/navigation';
import { submitOrThrow } from '$lib/ui/submit';
import { fileUrl } from '$shared/utils/files';

// Handlers throw the API's error message; DocEditor, DocsManager's
// ConfirmButton and EntityDetailPage's create flow catch and show it.

/* eslint-disable @typescript-eslint/no-explicit-any */
interface DocTrpc {
  add: { mutate: (input: any) => Promise<any> };
  update: { mutate: (input: any) => Promise<any> };
  remove: { mutate: (input: any) => Promise<any> };
  reorder: { mutate: (input: any) => Promise<any> };
  attachSource?: { mutate: (input: any) => Promise<any> };
  uploadImage?: { mutate: (input: any) => Promise<any> };
  getReadUrl?: { query: (input: any) => Promise<any> };
  convertPdf?: { mutate: (input: any) => Promise<any> };
  pdfConversion?: { query: (input: any) => Promise<any> };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const fileToBase64 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export interface DocHandlers {
  readonly handleAddDoc: (title: string) => Promise<void>;
  readonly handleSaveDoc: (content: string) => Promise<void>;
  readonly handleSaveTitle: (title: string) => Promise<void>;
  readonly handleRemoveDoc: (id: string) => Promise<void>;
  readonly handleReorderDocs: (docIds: readonly string[]) => Promise<void>;
  readonly handleUploadPdf: (file: File) => Promise<void>;
  readonly handleOpenSourcePdf: () => Promise<void>;
  /**
   * Converts the doc's PDF with the local Claude Code CLI and waits for it to
   * finish. Returns a warning when `claude` isn't installed; throws when the
   * conversion fails.
   */
  readonly handleConvertPdf: (docId: string) => Promise<string | null>;
  readonly handleUploadImage: (file: File) => Promise<string>;
  readonly handleResolveImages: (keys: string[]) => Promise<Record<string, string>>;
}

export const createDocHandlers = (
  docTrpc: DocTrpc,
  entityType: string,
  entityId: string,
  getActiveDocId: () => string | null,
  setActiveDocId: (id: string | null) => void | Promise<void>,
  pollMs = 3000,
): DocHandlers => ({
  handleAddDoc: async (title: string) => {
    const doc = await submitOrThrow(() => docTrpc.add.mutate({ entityType, entityId, title }));
    await invalidateAll();
    await setActiveDocId(doc.id);
  },

  handleSaveDoc: async (content: string) => {
    const docId = getActiveDocId();
    if (!docId) return;
    await submitOrThrow(() => docTrpc.update.mutate({ id: docId, content }));
    await invalidateAll();
  },

  handleSaveTitle: async (title: string) => {
    const docId = getActiveDocId();
    if (!docId) return;
    await submitOrThrow(() => docTrpc.update.mutate({ id: docId, title }));
    await invalidateAll();
  },

  handleRemoveDoc: async (id: string) => {
    await submitOrThrow(() => docTrpc.remove.mutate({ id }));
    if (getActiveDocId() === id) await setActiveDocId(null);
    await invalidateAll();
  },

  handleReorderDocs: async (docIds: readonly string[]) => {
    await submitOrThrow(() => docTrpc.reorder.mutate({ entityType, entityId, docIds: [...docIds] }));
    await invalidateAll();
  },

  handleUploadPdf: async (file: File) => {
    const docId = getActiveDocId();
    const attachSource = docTrpc.attachSource;
    if (!docId || !attachSource) return;
    const dataBase64 = await fileToBase64(file);
    await submitOrThrow(() => attachSource.mutate({ docId, contentType: 'application/pdf', dataBase64 }));
    await invalidateAll();
  },

  handleOpenSourcePdf: async () => {
    const docId = getActiveDocId();
    if (!docId || !docTrpc.getReadUrl) return;
    const result = await docTrpc.getReadUrl.query({ id: docId });
    if (result.ok) window.open(result.value.url, '_blank');
  },

  handleConvertPdf: async (docId: string): Promise<string | null> => {
    const { convertPdf, pdfConversion } = docTrpc;
    if (!convertPdf || !pdfConversion) return null;
    const started = await submitOrThrow(() => convertPdf.mutate({ id: docId }));
    if (!started.started) return started.warning;
    for (;;) {
      await wait(pollMs);
      const status = await submitOrThrow(() => pdfConversion.query({ id: docId }));
      if (status.state === 'running') continue;
      await invalidateAll();
      if (status.state === 'failed') throw new Error(status.message ?? "Claude couldn't convert the PDF.");
      return null;
    }
  },

  handleUploadImage: async (file: File): Promise<string> => {
    const docId = getActiveDocId();
    const { uploadImage } = docTrpc;
    if (!docId || !uploadImage) throw new Error('Save the doc before adding images.');
    const dataBase64 = await fileToBase64(file);
    const { key } = await submitOrThrow(() => uploadImage.mutate({ docId, contentType: file.type, dataBase64 }));
    return key;
  },

  // Keys are served by the files route, so resolving them needs no request.
  handleResolveImages: async (keys: string[]): Promise<Record<string, string>> =>
    Object.fromEntries(keys.map((key) => [key, fileUrl(key)])),
});
