// Connections wait for another process's write lock instead of failing at once,
// including the fresh connection libsql opens after every transaction.

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWaitingClient } from '../../src/shared/db/libsql.server';

const BUN = process.versions.bun ? process.execPath : 'bun';

describe('createWaitingClient', () => {
  it('waits for a lock another process holds, after a transaction as well as before', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'remry-busy-')), 'db.sqlite');
    const client = await createWaitingClient({ url: `file:${path}` });
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('CREATE TABLE t (n INTEGER)');

    // A transaction takes libsql's connection; later statements run on a new one.
    const tx = await client.transaction('write');
    await tx.execute('INSERT INTO t VALUES (1)');
    await tx.commit();
    tx.close();

    const holder = spawn(BUN, ['tests/integration/fixtures/hold-write-lock.ts', path, '500'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = new Promise<number | null>((resolve) => holder.on('close', resolve));
    await new Promise<void>((resolve) => holder.stdout.on('data', (chunk: Buffer) => chunk.toString().includes('locked') && resolve()));

    // Without the timeout on this new connection, SQLite answers SQLITE_BUSY at once.
    await client.execute('INSERT INTO t VALUES (3)');
    expect(await exited).toBe(0);

    const rows = await client.execute('SELECT n FROM t ORDER BY n');
    expect(rows.rows.map((r) => Number(r[0]))).toEqual([1, 2, 3]);
    client.close();
  });
});
