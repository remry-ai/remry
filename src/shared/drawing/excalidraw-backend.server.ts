// The app's one request of its own: Excalidraw's share-link storage, and only
// when the user asks (Share link in the app, or drawing.shareLink /
// drawing.importLink). It sends or fetches the drawing encrypted
// (excalidraw-link.ts); the key never leaves this computer except inside the
// link the user shares. One host, fixed here; a timeout and a size cap on both
// ways. See CLAUDE.md § Ground rules.

import { ok, err, type Result } from '$shared/utils/result';

export const EXCALIDRAW_JSON_HOST = 'https://json.excalidraw.com';
/** The most Remry uploads or downloads in one drawing. */
export const MAX_SHARE_BYTES = 5_000_000;
const TIMEOUT_MS = 20_000;

/** Stores and fetches encrypted drawings. Tests pass a fake. */
export interface ExcalidrawBackend {
  /** Stores the bytes; returns the id Excalidraw gave them. */
  readonly post: (payload: Uint8Array) => Promise<Result<string>>;
  readonly get: (id: string) => Promise<Result<Uint8Array>>;
}

const failure = (what: string, e: unknown): Error =>
  new Error(`Couldn't reach excalidraw.com to ${what} (${e instanceof Error ? e.message : String(e)}). Check the internet connection and try again.`);

export const excalidrawBackend: ExcalidrawBackend = {
  post: async (payload) => {
    if (payload.byteLength > MAX_SHARE_BYTES) return err(new Error(`This drawing is too big to share (${Math.round(payload.byteLength / 1e6)} MB; the limit is 5 MB).`));
    try {
      const response = await fetch(`${EXCALIDRAW_JSON_HOST}/api/v2/post/`, { method: 'POST', body: new Uint8Array(payload), signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = (await response.json().catch(() => ({}))) as { readonly id?: unknown; readonly error_class?: unknown };
      if (typeof body.id === 'string' && body.id) return ok(body.id);
      if (body.error_class === 'RequestTooLargeError') return err(new Error('excalidraw.com says this drawing is too big to share.'));
      return err(new Error(`excalidraw.com didn't store the drawing (HTTP ${response.status}).`));
    } catch (e) {
      return err(failure('share the drawing', e));
    }
  },
  get: async (id) => {
    try {
      const response = await fetch(`${EXCALIDRAW_JSON_HOST}/api/v2/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status === 404) return err(new Error("excalidraw.com has no drawing for that link: it may have been mistyped, or it's gone."));
      if (!response.ok) return err(new Error(`excalidraw.com couldn't send the drawing (HTTP ${response.status}).`));
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_SHARE_BYTES) return err(new Error('That drawing is too big to import (over 5 MB).'));
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.byteLength > MAX_SHARE_BYTES ? err(new Error('That drawing is too big to import (over 5 MB).')) : ok(bytes);
    } catch (e) {
      return err(failure('fetch the drawing', e));
    }
  }
};
