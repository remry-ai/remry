# Testing Conventions

## Unit tests — `**/tests/*.test.spec.ts`

- Colocated with the code: `src/api/{domain}/tests/`, `src/shared/*/tests/`, `src/lib/common/tests/`, `cli/tests/`, `scripts/backup/tests/`
- Build dependencies with `createTestRegistry({ ...overrides })` from `src/shared/registry.test.ts`. Mock only the Prisma models and storage calls the operation touches, cast with `as unknown as Registry['prisma']`.
- Test logic worth testing: validation (chart specs, CLI argument coercion), planning (migrations, retention), branching and error paths. Don't unit-test straight Prisma passthroughs.
- Run: `bun run test`

## Integration tests — `tests/integration/*.test.ts`

- Run against real SQLite in `./data/test` (`APP_ENV=test`). `setup.ts` **refuses to run** unless the data dir resolves to `./data/test`, so it can never wipe the real notebook.
- Before each file, `setup.ts` deletes `./data/test` and calls `ensureDatabase(TEST_NOTEBOOK)`, so the real layout code creates the default notebook `notebook` and the real migrator builds its database. It then adds an empty second notebook, `other`, and seeds three people in the first: `person_alice`, `person_bob`, `person_carol`.
- Call operations with `getRegistry(TEST_NOTEBOOK)` (ids in `tests/integration/test-notebooks.ts`). Tests run single-fork and share the notebooks within a file.
- Coverage:
  - `health`
  - `notebooks`: isolation of data and files, the `notebook` procedures, resolving the current notebook, `notebookHandle` (`?notebook=`, cookie, fallback), the files route, and moving a pre-notebooks data directory
  - `notebook`: person → group (team) → note → todo → tag
  - `reports`: branding resolution, chart validation
  - `goals-wiki`: project owner, goal cascade, check-ins and progress, project links, page properties, mentions from content, relation and attachment cleanup on delete
  - `page-chat`: the Chat tab's saved conversation per entity, Clear, and cleanup when the entity is deleted
  - `migrate`: fresh, idempotent, edited-migration refusal, search index backfill of existing rows
  - `search`: every trigger present, each kind of text found, stemming, phrases/OR/exclusions, type and `within` filters, re-indexing on update and delete (including cleanup), archived rows hidden, `search.recall` with unlinked mentions and caps
  - `backup`: change detection, hard links, restore round trip, snapshots kept per notebook, refusal while the app runs
  - `cli`: `bin/remry` from another directory with no server, including `--notebook`
  - `mcp`: `remry mcp` over stdio: tool list, calls (including `search_query` and `search_recall`), the `notebook` argument, errors as tool results, stdout kept to protocol messages
- Run: `bun run test:integration`

## Manual verification

- `bun run check` must have zero errors. It also type-checks `cli/` and `scripts/`.
- UI changes: run `bun run dev` and check the page in the browser
- API changes: exercise the procedure through `remry`
