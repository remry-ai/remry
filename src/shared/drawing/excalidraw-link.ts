// Excalidraw's shareable links: `https://excalidraw.com/#json=<id>,<key>`. The
// drawing is stored on Excalidraw's server (json.excalidraw.com) encrypted, and
// the key lives only in the link's fragment, which a browser never sends, so
// the server holds data it can't read. This file is the format, matching
// excalidraw's packages/excalidraw/data/encode.ts (compressData /
// decompressData) and data/encryption.ts, so links made here open on
// excalidraw.com and links from there open here:
//
//   [version 1 (u32)] [len (u32)] [encoding metadata JSON]
//                     [len (u32)] [AES-GCM iv, 12 bytes]
//                     [len (u32)] [AES-GCM( zlib( [version] [len] [metadata JSON] [len] [scene JSON] ) )]
//
// The key is a 128-bit AES-GCM key as its JWK `k` (base64url). Older links used
// the same key, a zero IV and plain JSON (`legacy`). Uses only Web Crypto and
// CompressionStream, so it runs in the browser and in Bun alike. No requests:
// excalidraw-backend.server.ts does those.

export const EXCALIDRAW_ORIGIN = 'https://excalidraw.com';

const CONCAT_VERSION = 1;
const IV_BYTES = 12;
const KEY_BITS = 128;

export interface ShareLink {
  readonly id: string;
  readonly key: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const KEY = /^[A-Za-z0-9_-]{16,64}$/;

/** The id and key in a share link (`#json=<id>,<key>`), or null for anything else. */
export const parseShareLink = (url: string): ShareLink | null => {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)excalidraw\.com$/.test(parsed.hostname)) return null;
  const match = /(?:^|[#&])json=([^,&]+),([^&]+)/.exec(parsed.hash);
  if (!match || !ID.test(match[1]!) || !KEY.test(match[2]!)) return null;
  return { id: match[1]!, key: match[2]! };
};

/** Says what's wrong with a link that isn't a share link, for an error. */
export const shareLinkProblem = (url: string): string =>
  /#room=/.test(url)
    ? "That's a live-collaboration link (#room=), which Excalidraw doesn't store; in Excalidraw, use Share → Export to link to get a #json= link"
    : "That isn't an Excalidraw share link: it looks like https://excalidraw.com/#json=<id>,<key>";

export const shareLinkUrl = (link: ShareLink): string => `${EXCALIDRAW_ORIGIN}/#json=${link.id},${link.key}`;

// A copy on a plain ArrayBuffer, which Web Crypto and Blob take.
const own = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

const u32 = (bytes: Uint8Array, offset: number): number => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);

const concatBuffers = (...buffers: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(4 + buffers.reduce((n, b) => n + 4 + b.byteLength, 0));
  const view = new DataView(out.buffer);
  view.setUint32(0, CONCAT_VERSION);
  let cursor = 4;
  for (const buffer of buffers) {
    view.setUint32(cursor, buffer.byteLength);
    out.set(buffer, cursor + 4);
    cursor += 4 + buffer.byteLength;
  }
  return out;
};

const splitBuffers = (bytes: Uint8Array): Uint8Array[] => {
  if (bytes.byteLength < 8) throw new Error('too short');
  if (u32(bytes, 0) > CONCAT_VERSION) throw new Error('not a version Remry reads');
  const buffers: Uint8Array[] = [];
  let cursor = 4;
  while (cursor < bytes.byteLength) {
    const size = u32(bytes, cursor);
    cursor += 4;
    if (cursor + size > bytes.byteLength) throw new Error('truncated');
    buffers.push(bytes.slice(cursor, cursor + size));
    cursor += size;
  }
  return buffers;
};

const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> => {
  const out = new Blob([own(bytes)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
};

// zlib, as pako's deflate writes it.
const deflate = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new CompressionStream('deflate'));
const inflate = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new DecompressionStream('deflate'));

const importKey = (key: string, usage: KeyUsage): Promise<CryptoKey> =>
  crypto.subtle.importKey('jwk', { alg: 'A128GCM', ext: true, k: key, key_ops: ['encrypt', 'decrypt'], kty: 'oct' }, { name: 'AES-GCM', length: KEY_BITS }, false, [usage]);

const newKey = async (): Promise<string> => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: KEY_BITS }, true, ['encrypt', 'decrypt']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  if (!jwk.k) throw new Error('could not make a key');
  return jwk.k;
};

const text = new TextEncoder();
const read = new TextDecoder();

/** Encrypts a scene's JSON as Excalidraw stores it, with a new key. The bytes go to the server; the key goes only in the link. */
export const encryptScene = async (sceneJson: string): Promise<{ readonly payload: Uint8Array; readonly key: string }> => {
  const key = await newKey();
  const contents = concatBuffers(text.encode('null'), text.encode(sceneJson));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key, 'encrypt'), own(await deflate(contents))));
  const info = text.encode(JSON.stringify({ version: 2, compression: 'pako@1', encryption: 'AES-GCM' }));
  return { payload: concatBuffers(info, iv, encrypted), key };
};

const decryptCurrent = async (bytes: Uint8Array, key: string): Promise<string> => {
  const [info, iv, encrypted] = splitBuffers(bytes);
  if (!info || !iv || !encrypted) throw new Error('missing parts');
  const meta = JSON.parse(read.decode(info)) as { readonly compression?: string | null };
  const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: own(iv) }, await importKey(key, 'decrypt'), own(encrypted)));
  const [, contents] = splitBuffers(meta.compression ? await inflate(decrypted) : decrypted);
  if (!contents) throw new Error('no drawing in it');
  return read.decode(contents);
};

// Links from before 2021: the scene's JSON, encrypted with a zero IV.
const decryptLegacy = async (bytes: Uint8Array, key: string): Promise<string> => {
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(IV_BYTES) }, await importKey(key, 'decrypt'), own(bytes));
  return read.decode(decrypted);
};

/** A shared drawing's scene JSON, from the bytes Excalidraw's server returned and the link's key. */
export const decryptScene = async (bytes: Uint8Array, key: string): Promise<string> => {
  try {
    return await decryptCurrent(bytes, key);
  } catch {
    try {
      return await decryptLegacy(bytes, key);
    } catch {
      throw new Error("The drawing couldn't be decrypted: check the link was copied whole, key included (the part after the comma)");
    }
  }
};
