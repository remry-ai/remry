# Testing Conventions

## Unit tests — `**/tests/*.test.spec.ts`

- Colocated with the code: `src/api/{domain}/tests/`, `src/shared/*/tests/`, `src/lib/common/tests/`, `cli/tests/`, `scripts/backup/tests/`
- Build dependencies with `createTestRegistry({ ...overrides })` from `src/shared/registry.test.ts`. Mock only the Prisma models and storage calls the operation touches, cast with `as unknown as Registry['prisma']`.
- Test logic worth testing: validation (chart specs, CLI argument coercion), planning (migrations, retention), branching and error paths. Don't unit-test straight Prisma passthroughs.
- Run: `bun run test`

## Component tests — `src/**/*.dom.spec.ts`

- For flows that only break in Svelte's real reactive runtime (an update order, a component torn down mid-navigation). Svelte components are mounted with `mount` from `svelte` in jsdom, with Svelte's browser runtime (`vitest.dom.config.ts`). `bun run test` runs them in parallel with the unit tests, as two projects of one run (`vitest.parallel.ts`).
- Mock SvelteKit's modules with `vi.mock`: `$app/state` with `src/lib/common/tests/fake-page.svelte.ts` (a reactive `page`; `setUrl` stands in for a navigation), `$app/stores`, `$app/navigation`, and `$shared/trpc/client` so nothing reaches a server.
- Change the URL, then `flushSync()` inside `expect(...).not.toThrow()`: an error thrown while the page updates is the failure.
- `entity-peek.dom.spec.ts` opens a detail page's peek of each type and leaves it with ×, Open, and another peek, with the right panel mounted beside it (`PeekHarness`), since the panel draws the peek's content. Before 0.16.28 closing a peek threw and stopped the navigation.
- Make a new one fail against the broken code before trusting it.

## Integration tests — `tests/integration/*.test.ts`

- Run against real SQLite in `./data/test` (`APP_ENV=test`). `setup.ts` **refuses to run** unless the data dir resolves to `./data/test`, so it can never wipe the real notebook.
- Before each file, `setup.ts` deletes `./data/test` and calls `ensureDatabase(TEST_NOTEBOOK)`, so the real layout code creates the default notebook `notebook` and the real migrator builds its database. It then adds an empty second notebook, `other`, and seeds three people in the first: `person_alice`, `person_bob`, `person_carol`.
- Call operations with `getRegistry(TEST_NOTEBOOK)` (ids in `tests/integration/test-notebooks.ts`). Tests run single-fork and share the notebooks within a file.
- Coverage:
  - `health`
  - `notebooks`: isolation of data and files, the `notebook` procedures, resolving the current notebook, `notebookHandle` (`?notebook=`, cookie, fallback), the files route, and moving a pre-notebooks data directory
  - `notebook`: person → group (team) → note → todo → tag
  - `reports`: branding resolution, chart validation
  - `goals-wiki`: project owner, goal cascade, check-ins and progress, project links, mentions from content, relation and attachment cleanup on delete
  - `archive-leaks`: an archived entity of each type (and a doc on one) never shows through an active one's reads: lead and reports, members, children, a goal's projects, the Related list, counts, the org map, the home graph
  - `large-notebook`: 1,100 rows of each kind, with a hub of each type linked to all of them; every query procedure with each input it accepts, then deleting the hubs. It caught Prisma's assumed 999-value limit (see `prisma/CLAUDE.md`)
  - `page-chat`: the Chat tab's saved conversation per entity, Clear, and cleanup when the entity is deleted
  - `migrate`: fresh, idempotent, edited-migration refusal, search index backfill of existing rows
  - `search`: every trigger present, each kind of text found, stemming, phrases/OR/exclusions, type and `within` filters, re-indexing on update and delete (including cleanup), archived rows hidden, `search.recall` with unlinked mentions and caps
  - `backup`: change detection, hard links, restore round trip, snapshots kept per notebook, refusal while the app runs
  - `cli`: `bin/remry` from another directory with no server, including `--notebook`
  - `mcp`: `remry mcp` over stdio: tool list, calls (including `search_query` and `search_recall`), the `notebook` argument, errors as tool results, a `url` beside each app `path`, a file uploaded as a link and read back (`link_upload`, `link_read`: text as text, an image as an image part), stdout kept to protocol messages
- Run: `bun run test:integration`

## Manual verification

- `bun run check` must have zero errors. It also type-checks `cli/` and `scripts/`.
- UI changes: run `bun run dev` and check the page in the browser
- API changes: exercise the procedure through `remry`
