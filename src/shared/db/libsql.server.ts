// SQLite connections that wait for a lock instead of failing at once. The app, the
// CLI, every MCP server and the hourly backup share one WAL database, so writers
// meet; a connection with no busy timeout gets SQLITE_BUSY the moment they do.

import { createClient, type Client, type Config, type Transaction, type TransactionMode } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

export const BUSY_TIMEOUT_MS = 5000;
export const BUSY_TIMEOUT = `PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`;

/**
 * The client with the busy timeout on every connection it opens. libsql hands its
 * connection to each transaction and opens a fresh one on next use, with SQLite's
 * default timeout of 0, so the setting is applied again after every transaction.
 * The wait is for other processes: libsql runs statements synchronously, so while a
 * connection waits, this process's event loop does too.
 */
export const withBusyTimeout = (client: Client): Client => {
  const transaction = async (mode?: TransactionMode): Promise<Transaction> => {
    await client.execute(BUSY_TIMEOUT);
    const tx = await client.transaction(mode);
    await client.execute(BUSY_TIMEOUT);
    return tx;
  };
  return new Proxy(client, {
    get: (target, prop) => {
      if (prop === 'transaction') return transaction;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
};

/** A libsql client whose connections all wait for locks. */
export const createWaitingClient = async (config: Config): Promise<Client> => {
  const client = withBusyTimeout(createClient(config));
  await client.execute(BUSY_TIMEOUT);
  return client;
};

const isBusy = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && String(error.code).startsWith('SQLITE_BUSY');

/**
 * Puts the database in WAL mode (persistent: the app, the CLI and backups then read and
 * write concurrently). On a new file this needs an exclusive lock, and when two processes
 * create the notebook at once SQLite answers one with SQLITE_BUSY without waiting (to
 * avoid a deadlock), so it retries for a few seconds. On a WAL database it's a no-op.
 */
export const enableWal = async (client: Client, attempts = 50, delayMs = 100): Promise<void> => {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.execute('PRAGMA journal_mode = WAL');
      return;
    } catch (error) {
      if (!isBusy(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

/** Prisma's libsql adapter, with every connection waiting for locks. */
export class PrismaLibSqlWaiting extends PrismaLibSql {
  override createClient(config: Config): Client {
    const client = withBusyTimeout(super.createClient(config));
    // The local client runs statements synchronously, so this applies before any query Prisma sends.
    void client.execute(BUSY_TIMEOUT);
    return client;
  }
}
