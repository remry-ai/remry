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

/** Uploads an image into a doc's folder and returns its storage key. */
const uploadImageTo = async (docTrpc: DocTrpc, docId: string, file: File): Promise<string> => {
  const { uploadImage } = docTrpc;
  if (!uploadImage) throw new Error("Images can't be added here.");
  const dataBase64 = await fileToBase64(file);
  const { key } = await submitOrThrow(() => uploadImage.mutate({ docId, contentType: file.type, dataBase64 }));
  return key as string;
};

export const fileToBase64 = async (file: File): Promise<string> => {
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
  /**
   * A new doc's steps before it opens: create it on the server without opening it (so the draft's
   * editor stays put while its images upload to it), then finish it (title and text, then open it),
   * or discard it if the draft is closed unsaved.
   */
  readonly handleCreateDraftDoc: (title: string) => Promise<string>;
  readonly handleFinishDraftDoc: (docId: string, title: string, content: string) => Promise<void>;
  readonly handleDiscardDraftDoc: (docId: string) => Promise<void>;
  readonly handleUploadImageTo: (docId: string, file: File) => Promise<string>;
  readonly handleSaveDoc: (content: string) => Promise<void>;
  readonly handleSaveTitle: (title: string) => Promise<void>;
  readonly handleRemoveDoc: (id: string) => Promise<void>;
  readonly handleReorderDocs: (docIds: readonly string[]) => Promise<void>;
  /** Attaches a source file to the open doc; returns its stored key, or null when nothing was attached. */
  readonly handleUploadPdf: (file: File) => Promise<string | null>;
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

  handleCreateDraftDoc: async (title: string): Promise<string> => {
    const doc = await submitOrThrow(() => docTrpc.add.mutate({ entityType, entityId, title }));
    return doc.id as string;
  },

  handleFinishDraftDoc: async (docId: string, title: string, content: string) => {
    await submitOrThrow(() => docTrpc.update.mutate({ id: docId, title, ...(content ? { content } : {}) }));
    await invalidateAll();
    await setActiveDocId(docId);
  },

  handleDiscardDraftDoc: async (docId: string) => {
    await submitOrThrow(() => docTrpc.remove.mutate({ id: docId }));
    await invalidateAll();
  },

  handleUploadImageTo: async (docId: string, file: File): Promise<string> => uploadImageTo(docTrpc, docId, file),

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
    if (!docId || !attachSource) return null;
    const dataBase64 = await fileToBase64(file);
    const attached = (await submitOrThrow(() => attachSource.mutate({ docId, fileName: file.name, dataBase64 }))) as { readonly sourceUrl?: string } | undefined;
    await invalidateAll();
    return attached?.sourceUrl ?? null;
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
      if (status.state === 'failed') throw new Error(status.message ?? "Claude couldn't convert the file.");
      return null;
    }
  },

  handleUploadImage: async (file: File): Promise<string> => {
    const docId = getActiveDocId();
    if (!docId) throw new Error('Save the doc before adding images.');
    return uploadImageTo(docTrpc, docId, file);
  },

  // Keys are served by the files route, so resolving them needs no request.
  handleResolveImages: async (keys: string[]): Promise<Record<string, string>> =>
    Object.fromEntries(keys.map((key) => [key, fileUrl(key)])),
});
