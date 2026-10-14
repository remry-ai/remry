import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorageClient } from '../client.server';

describe('deleteFolder', () => {
  const setUp = async () => {
    const root = join(mkdtempSync(join(tmpdir(), 'remry-storage-')), 'files');
    const storage = createStorageClient(root);
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.putObject('docs/d1/image-a.png', bytes, 'image/png');
    await storage.putObject('docs/d1/source-b.pdf', bytes, 'application/pdf');
    await storage.putObject('docs/d2/image-c.png', bytes, 'image/png');
    return { root, storage };
  };

  it('removes one folder and everything in it, and nothing else', async () => {
    const { root, storage } = await setUp();
    await storage.deleteFolder('docs/d1');
    expect(existsSync(join(root, 'docs/d1'))).toBe(false);
    expect(existsSync(join(root, 'docs/d2/image-c.png'))).toBe(true);
  });

  it('never removes the files root, or anything outside it', async () => {
    const { root, storage } = await setUp();
    for (const prefix of ['', '.', '..', '../files', 'docs/../..']) await storage.deleteFolder(prefix);
    expect(existsSync(join(root, 'docs/d2/image-c.png'))).toBe(true);
  });
});

describe('listFolder and moveObject', () => {
  it('lists only the files directly in a folder, and moves one, marking it modified now', async () => {
    const root = join(mkdtempSync(join(tmpdir(), 'remry-storage-')), 'files');
    const storage = createStorageClient(root);
    const bytes = new Uint8Array([1]);
    await storage.putObject('pages/p1/image-a.png', bytes, 'image/png');
    await storage.putObject('pages/p1/removed/image-b.png', bytes, 'image/png');

    expect((await storage.listFolder('pages/p1')).map((f) => f.name)).toEqual(['image-a.png']);
    expect(await storage.listFolder('pages/none')).toEqual([]);

    const before = Date.now();
    await storage.moveObject('pages/p1/image-a.png', 'pages/p1/removed/image-a.png');
    const removed = await storage.listFolder('pages/p1/removed');
    expect(removed.map((f) => f.name).sort()).toEqual(['image-a.png', 'image-b.png']);
    expect(removed.find((f) => f.name === 'image-a.png')!.modifiedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    await expect(storage.moveObject('pages/p1/missing.png', 'pages/p1/removed/missing.png')).resolves.toBeUndefined();
    await expect(storage.moveObject('pages/p1/removed/image-b.png', '../outside.png')).rejects.toThrow('Invalid storage key');
  });
});
