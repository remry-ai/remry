// The composition root. The ONLY place `new PrismaClient()` is ever called.
// Each notebook has its own database and files, so there is one Registry (and one
// PrismaClient) per notebook in use, created on first use. Everything (routes,
// CLI-facing tRPC, integration tests) pulls Prisma through getRegistry(notebookId).

import { mkdirSync } from 'node:fs';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../../generated/prisma/client';
import { createLogger } from '$shared/utils/logger';
import { createStorageClient } from '$shared/storage/client.server';
import { settings } from '$shared/settings/server/index.server';
import { databaseUrl, filesDir, notebookDir } from '$shared/settings/server/paths';
import type { Registry } from './registry';

const registries = new Map<string, Registry>();

/** The notebook's Registry. Use getReadyRegistry() unless its database is already prepared. */
export const getRegistry = (notebookId: string): Registry => {
  const cached = registries.get(notebookId);
  if (cached) return cached;
  mkdirSync(notebookDir(settings, notebookId), { recursive: true });
  const registry: Registry = {
    prisma: new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl(settings, notebookId) }) }),
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
    logger: createLogger(),
    storage: createStorageClient(filesDir(settings, notebookId))
  };
  registries.set(notebookId, registry);
  return registry;
};

/** Disconnects every notebook's database. Call when a process is done. */
export const closeRegistries = async (): Promise<void> => {
  const open = [...registries.values()];
  registries.clear();
  await Promise.all(open.map((r) => r.prisma.$disconnect()));
};
