# Database Conventions — `prisma/`

SQLite, one file per user: `~/Library/Application Support/Remry/working-notes.db` (`./data/test` for integration tests). The path comes from `src/shared/settings/server` via `server/paths.ts`, used by `prisma.config.ts`, `src/shared/registry.server.ts` and the migrator.

## Schema conventions

- snake_case **singular** table names and snake_case columns via `@@map` / `@map`
- **No enums** (the SQLite connector rejects them). Enum-like columns are `String` with a string `@default`, validated by Zod against the unions in `src/shared/types/enums.ts`. Add new values there.
- **No native type attributes** (`@db.Text` etc.) and no `String[]`
- No users or orgs, and no columns that record which user or org owns a row. Don't add `createdById` or `orgId`. An org-chart owner (the group that owns a project) is data, and is allowed.
- Polymorphic assets use `entityType String` + `entityId String` with `@@index([entityType, entityId])`, and no foreign key to the entity
- The same no-FK convention covers goal and project owners (`ownerType` + `ownerId`, indexed together) and relations, where both ends are polymorphic (`fromType`/`fromId`, `toType`/`toId`, each indexed). Deletes clean these up in code with `planEntityCleanup` (`src/api/_entity-cleanup.ts`).
- The Prisma client is generated to `generated/prisma` (gitignored); import it only in `src/shared/registry.ts` / `registry.server.ts`

## Migrations

**Migrations apply themselves.** `src/shared/db/migrate.server.ts` runs pending migrations in-process whenever the app, the CLI or a backup starts (via `ensureDatabase()`). It reads and writes Prisma's `_prisma_migrations` table in Prisma's own format, so both tools agree on what's applied.

- **Author a change:** edit `schema.prisma`, then `bun run db:migrate --name <descriptive_snake_case>`. This runs against your real notebook, so take `bun run backup --force --reason "before <migration>"` first. Commit the new folder with the schema.
- **Additive migrations:** an update often leaves an older Remry running for a while (a Claude session's MCP server, an app server not yet replaced). A database records in `PRAGMA user_version` how many migrations a Remry must know to use it, counting to the last one not in `ADDITIVE_MIGRATIONS` (`src/shared/db/migrate.server.ts`), and an older Remry opens a database with newer migrations it doesn't know when that count is within its own (`planMigrations`). Add a new migration's name to `ADDITIVE_MIGRATIONS` when it only adds (an index, a table, a nullable column) and changes nothing an older Remry reads or writes; leave it out otherwise, and older Remrys refuse the notebook with "Update Remry". Remry before 0.16.32 doesn't check, and refuses any migration it doesn't know.
- **Never edit an applied migration.** The migrator compares checksums and refuses to start if a migration changed after it ran; fix forward with a new migration.
- **SQLite migrations run without a wrapping transaction** (Prisma's table-redefinition SQL needs `PRAGMA foreign_keys=OFF`). If one fails, its row keeps `finished_at` null with the error in `logs`, and startup refuses until it's repaired. Restore the pre-migration snapshot, fix the migration, and retry.
- **Several processes can open a notebook at once** (the desktop server and MCP servers, right after an update). Each migration is claimed first: under a write lock (`BEGIN IMMEDIATE`), a process records the migration's unfinished row, then runs its SQL outside the lock. Another process that sees a fresh claim (unfinished, no `logs`, started under 10 minutes ago; `migrationInProgress`) waits for it rather than calling it failed. `tests/integration/migrate.test.ts` runs two processes against one file.
- **Every connection waits for locks.** libsql's busy timeout defaults to 0, and its client opens a fresh connection after each transaction. `src/shared/db/libsql.server.ts` re-applies `busy_timeout` after every transaction (`PrismaLibSqlWaiting` for the Registry, `createWaitingClient` elsewhere), and `enableWal` retries the switch to WAL on a brand-new file.
- Don't use `prisma db push`.
- **The full-text index lives outside Prisma.** `search_index` (an FTS5 virtual table) and its triggers come from the hand-written `add_search_index` migration. `prisma.config.ts` lists the table and its shadow tables under `tables.external`, so `migrate dev` leaves them alone. But when Prisma **redefines** an indexed table (`CREATE TABLE "new_x"`, copy, `DROP TABLE "x"`, rename; it does this for most column changes other than adding a nullable or defaulted column), SQLite drops that table's triggers with it and the index silently stops updating. Copy the table's three `search_<table>_*` triggers from `add_search_index` to the end of the new migration. `src/shared/db/tests/search-index-guard.test.spec.ts` fails until you do, and `tests/integration/search.test.ts` checks every trigger exists after migrating. See `src/api/CLAUDE.md` § Search.
