// Snapshots of one notebook: a consistent copy of its database (VACUUM INTO), its
// uploaded files and a manifest, in <data dir>/Backups/<notebook>/<id>/. Taken
// only when the data changed, unless forced.

import { createHash } from 'node:crypto';
import { copyFile, link, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { settings } from '$shared/settings/server/index.server';
import { backupsDir, databaseUrl, filesDir } from '$shared/settings/server/paths';
import { ensureDatabase } from '$shared/db/bootstrap.server';
import { parseSnapshotId, selectSnapshotsToKeep, snapshotId } from './retention';

export interface FileEntry {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface SnapshotManifest {
  /** 2 added `notebook`. Snapshots from before notebooks are version 1. */
  readonly version: 1 | 2;
  readonly id: string;
  readonly notebook?: string;
  readonly createdAt: string;
  readonly reason: string;
  /** Hash of every table's rows, the applied migrations and the file list. */
  readonly fingerprint: string;
  readonly dbSha256: string;
  readonly migrations: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
  readonly files: readonly FileEntry[];
  readonly bytes: number;
}

export interface Snapshot {
  readonly id: string;
  readonly path: string;
  readonly manifest: SnapshotManifest;
}

export interface SnapshotOutcome {
  readonly status: 'created' | 'unchanged';
  readonly snapshot: Snapshot | null;
  readonly pruned: readonly string[];
}

export interface SnapshotOptions {
  /** Notebook id. */
  readonly notebook: string;
  readonly force?: boolean;
  readonly reason?: string;
  readonly now?: Date;
}

const listFiles = async (root: string): Promise<readonly FileEntry[]> => {
  const out: FileEntry[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const s = await stat(full);
        out.push({ path: relative(root, full), size: s.size, mtimeMs: Math.round(s.mtimeMs) });
      }
    }
  };
  await walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
};

const STALE_PARTIAL_MS = 60 * 60 * 1000;

const jsonSafe = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? value.toString() : value instanceof ArrayBuffer ? Buffer.from(value).toString('base64') : value;

const fingerprintData = async (
  client: Client,
  files: readonly FileEntry[]
): Promise<{ readonly fingerprint: string; readonly counts: Record<string, number>; readonly migrations: readonly string[] }> => {
  const hash = createHash('sha256');
  const counts: Record<string, number> = {};

  // The full-text index (search_index and its FTS5 shadow tables) is derived from the other tables.
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' AND name NOT GLOB 'search_index*' ORDER BY name"
  );
  for (const row of tables.rows) {
    const table = String(row[0]);
    const rs = await client.execute(`SELECT * FROM "${table.replace(/"/g, '""')}" ORDER BY rowid`);
    counts[table] = rs.rows.length;
    hash.update(`table ${table}\n`);
    for (const r of rs.rows) hash.update(`${JSON.stringify(rs.columns.map((_, i) => r[i]), jsonSafe)}\n`);
  }

  const applied = await client.execute(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name'
  );
  const migrations = applied.rows.map((r) => String(r[0]));
  hash.update(`migrations ${migrations.join(',')}\n`);
  for (const f of files) hash.update(`file ${f.path} ${f.size} ${f.mtimeMs}\n`);

  return { fingerprint: hash.digest('hex'), counts, migrations };
};

/** A notebook's complete snapshots, newest first. */
export const listSnapshots = async (notebook: string): Promise<readonly Snapshot[]> => {
  const root = backupsDir(settings, notebook);
  const names = await readdir(root).catch(() => [] as string[]);
  const snapshots: Snapshot[] = [];
  for (const id of names.filter((n) => parseSnapshotId(n) !== null)) {
    try {
      const manifest = JSON.parse(await readFile(join(root, id, 'manifest.json'), 'utf8')) as SnapshotManifest;
      snapshots.push({ id, path: join(root, id), manifest });
    } catch {
      // Not a complete snapshot; ignore it.
    }
  }
  return snapshots.sort((a, b) => b.id.localeCompare(a.id));
};

export const pruneSnapshots = async (notebook: string, now: Date): Promise<readonly string[]> => {
  const root = backupsDir(settings, notebook);
  const names = await readdir(root).catch(() => [] as string[]);
  const ids = names.filter((n) => parseSnapshotId(n) !== null);
  const keep = selectSnapshotsToKeep(ids, now);
  const pruned = ids.filter((id) => !keep.has(id));
  for (const id of pruned) await rm(join(root, id), { recursive: true, force: true });

  // Partial snapshots left by an interrupted run.
  for (const name of names.filter((n) => n.startsWith('.') && n.endsWith('.partial'))) {
    const s = await stat(join(root, name)).catch(() => null);
    if (s && now.getTime() - s.mtimeMs > STALE_PARTIAL_MS) await rm(join(root, name), { recursive: true, force: true });
  }
  return pruned;
};

const sha256File = async (path: string): Promise<string> =>
  createHash('sha256').update(await readFile(path)).digest('hex');

const freeId = (taken: ReadonlySet<string>, now: Date): string => {
  let t = now.getTime();
  while (taken.has(snapshotId(new Date(t)))) t += 1000;
  return snapshotId(new Date(t));
};

export const createSnapshot = async (options: SnapshotOptions): Promise<SnapshotOutcome> => {
  const { notebook } = options;
  const now = options.now ?? new Date();
  await ensureDatabase(notebook);

  const root = backupsDir(settings, notebook);
  await mkdir(root, { recursive: true });
  const files = await listFiles(filesDir(settings, notebook));
  const client = createClient({ url: databaseUrl(settings, notebook) });

  try {
    const { fingerprint, counts, migrations } = await fingerprintData(client, files);
    const existing = await listSnapshots(notebook);
    const latest = existing[0] ?? null;
    if (!options.force && latest?.manifest.fingerprint === fingerprint) {
      return { status: 'unchanged', snapshot: latest, pruned: [] };
    }

    const id = freeId(new Set(existing.map((s) => s.id)), now);
    const partial = join(root, `.${id}.partial`);
    const final = join(root, id);
    await rm(partial, { recursive: true, force: true });
    await mkdir(join(partial, 'files'), { recursive: true });

    // VACUUM INTO writes a consistent, compact copy even while the app is writing.
    const dbCopy = join(partial, 'working-notes.db');
    await client.execute({ sql: 'VACUUM INTO ?', args: [dbCopy] });
    let bytes = (await stat(dbCopy)).size;

    // Unchanged files are hard-linked from the previous snapshot instead of copied.
    const previous = new Map((latest?.manifest.files ?? []).map((f) => [f.path, f]));
    for (const f of files) {
      const dest = join(partial, 'files', f.path);
      await mkdir(dirname(dest), { recursive: true });
      const prev = previous.get(f.path);
      const linked = latest && prev && prev.size === f.size && prev.mtimeMs === f.mtimeMs
        ? await link(join(latest.path, 'files', f.path), dest).then(() => true, () => false)
        : false;
      if (!linked) await copyFile(join(filesDir(settings, notebook), f.path), dest);
      bytes += f.size;
    }

    const manifest: SnapshotManifest = {
      version: 2,
      id,
      notebook,
      createdAt: now.toISOString(),
      reason: options.reason ?? 'manual',
      fingerprint,
      dbSha256: await sha256File(dbCopy),
      migrations,
      counts,
      files,
      bytes
    };
    await writeFile(join(partial, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(partial, final);

    const pruned = await pruneSnapshots(notebook, now);
    return { status: 'created', snapshot: { id, path: final, manifest }, pruned };
  } finally {
    client.close();
  }
};
