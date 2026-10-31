// Local-disk object storage under a notebook's files folder.
// Keys are relative paths (e.g. `docs/<id>/source-<uuid>.pdf`); any key that
// resolves outside the files root is rejected.

import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface StoredFile {
  readonly name: string;
  readonly modifiedAt: Date;
}

export interface StorageClient {
  readonly putObject: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  readonly readObject: (key: string) => Promise<StoredObject | null>;
  readonly deleteObject: (key: string) => Promise<void>;
  /** Deletes a folder of keys (`docs/<id>`) and everything in it. Never the files root itself. */
  readonly deleteFolder: (prefix: string) => Promise<void>;
  /** The files directly in a folder (not its subfolders), or none if it doesn't exist. */
  readonly listFolder: (prefix: string) => Promise<readonly StoredFile[]>;
  /** Moves a file to another key, marking it modified now. Does nothing if it's missing. */
  readonly moveObject: (from: string, to: string) => Promise<void>;
  /** Absolute path of `key` on disk, or null for a key outside the files root. */
  readonly pathFor: (key: string) => string | null;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // A doc's text source files. Always plain text, so an HTML or SVG file can't run in the app.
  ...Object.fromEntries(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.html', '.htm', '.xml', '.svg', '.yaml', '.yml', '.log', '.rtf'].map((ext) => [ext, 'text/plain; charset=utf-8']))
};

/** Absolute path for `key` inside `root`, or null if it would escape `root`. */
export const resolveKey = (root: string, key: string): string | null => {
  const base = resolve(root);
  const full = resolve(base, key);
  return full.startsWith(base + sep) ? full : null;
};

export const createStorageClient = (root: string): StorageClient => ({
  putObject: async (key: string, body: Uint8Array): Promise<void> => {
    const path = resolveKey(root, key);
    if (!path) throw new Error(`Invalid storage key: ${key}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  },

  readObject: async (key: string): Promise<StoredObject | null> => {
    const path = resolveKey(root, key);
    if (!path) return null;
    try {
      const bytes = await readFile(path);
      return {
        bytes: new Uint8Array(bytes),
        contentType: CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
      };
    } catch {
      return null;
    }
  },

  deleteObject: async (key: string): Promise<void> => {
    const path = resolveKey(root, key);
    if (!path) return;
    await rm(path, { force: true });
  },

  deleteFolder: async (prefix: string): Promise<void> => {
    // resolveKey only returns paths strictly inside the root, so the root itself can't go.
    const path = resolveKey(root, prefix);
    if (!path) return;
    await rm(path, { recursive: true, force: true });
  },

  listFolder: async (prefix: string): Promise<readonly StoredFile[]> => {
    const path = resolveKey(root, prefix);
    if (!path) return [];
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => ({ name: entry.name, modifiedAt: (await stat(resolve(path, entry.name))).mtime }))
      );
    } catch {
      return [];
    }
  },

  moveObject: async (from: string, to: string): Promise<void> => {
    const source = resolveKey(root, from);
    const target = resolveKey(root, to);
    if (!source || !target) throw new Error(`Invalid storage key: ${source ? to : from}`);
    await mkdir(dirname(target), { recursive: true });
    try {
      await rename(source, target);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return;
      throw error;
    }
    const now = new Date();
    await utimes(target, now, now);
  },

  pathFor: (key: string): string | null => resolveKey(root, key)
});
