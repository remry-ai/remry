# Development

You need [Bun](https://bun.sh). Claude Code and the Claude desktop app are optional.

```bash
git clone <repo-url> remry
cd remry
bun install
bun run setup              # put `remry` on PATH and install the Claude plugin
remry app                 # the dev server at http://127.0.0.1:5173
```

The database is created on first use. Try it:

```bash
remry help
remry person.create --name "Alice Johnson" --extensions '{"org":{"title":"Staff Engineer"}}'
```

Dev and prod share the same notebooks in your app data folder. Integration tests use `./data/test`
(`APP_ENV=test`) and refuse to run against anything else.

## What `bun run setup` does

Four things, and it's safe to re-run:

1. Writes a pointer at this clone (`<data dir>/app-path`).
2. Links `remry` into Bun's global bin folder (`~/.bun/bin`), so it works from any directory.
3. Zips `plugin/` into `dist/remry.zip`, for Claude desktop Chat and Cowork.
4. Installs this clone's plugin in Claude Code as `remry-dev`, from a marketplace it writes into
   `dist/dev-marketplace`, so it isn't mistaken for the released `remry` that Chat and Cowork get from
   claude.ai. Re-run setup after changing the skill: it reinstalls `remry-dev` each time.

The pointer matters: the plugin carries no app, so its MCP server runs **this clone's code**. The
shim, `plugin/scripts/remry`, tries `$REMRY_HOME`, then the clone named by `app-path`.

- **Moved the clone?** Run `bun run setup` again from the new location.
- **Update:** `git pull && bun install && bun run setup`.
- **Uninstall:** `bun run setup uninstall`. Your notebook data is not touched.

The install and uninstall logic is the pure `planInstall`/`planUninstall` in
`scripts/setup/plan.ts`.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on http://127.0.0.1:5173 |
| `bun run build && bun run start` | Production server, loopback only |
| `bun run lint` | ESLint for TypeScript and Svelte (`lint:fix` fixes what it can) |
| `bun run check` | svelte-check, plus tsc for `cli/` and `scripts/` |
| `bun run test` | Unit tests (`src/`, `cli/`, `scripts/`) |
| `bun run test:integration` | Integration tests against `./data/test` |
| `bun run backup [list\|restore\|install\|uninstall]` | Snapshots and restore |
| `bun run db:migrate --name <change>` | Author a migration against the default notebook |
| `bun run db:studio` | Prisma Studio, on the same notebook |
| `bun run setup [uninstall]` | PATH, plugin zip, Claude Code plugin |

You author migrations against a real notebook, so run `bun run backup --force` first. Every other
notebook migrates forward the next time a process opens it. If a migration reports "database is
locked", another process holds the notebook open: close the app and any running MCP server.

## Layout

```
src/
├── api/      # Backend-only: domain operations + tRPC routers
├── shared/   # Used by both sides: tRPC, registry, settings, storage, types, utils
├── lib/      # Frontend: components, stores, chart rendering
└── routes/   # SvelteKit routes — thin entry points
```

Ask "who imports this?" Only the backend → `src/api/`. Both → `src/shared/`. Only the frontend →
`src/lib/`.

Conventions, the Registry, `Result`, the report chart spec and the schema rules are in
[CLAUDE.md](../CLAUDE.md) and the scoped `CLAUDE.md` files under `src/api/`, `src/lib/`,
`src/routes/`, `prisma/` and `tests/`.

## The plugin

The repository is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) holding one
plugin, in `plugin/`. The plugin contains the skill, the shim that `.mcp.json` runs, and
`plugin/.mcp.json` itself.

It lives in a subdirectory so that the plugin's cache copy holds only those files. At the repository
root, Claude would copy the whole application, including the `bin/` folder that plugins hosted on
claude.ai reject.

Claude desktop starts MCP servers with a minimal PATH, so `.mcp.json` runs the shim with `sh`, and
`bin/remry` looks for Bun in `~/.bun/bin`, `/opt/homebrew/bin` and `/usr/local/bin` (or
`$REMRY_BUN`).

**Bump the version whenever the plugin should update:**

```bash
bun run release:version <x.y.z>
```

It sets `plugin/.claude-plugin/plugin.json` and `package.json` together. `claude plugin update`
and Cowork skip a version they already have.

Don't edit `.claude-plugin/marketplace.json`: Claude desktop learns of an update from its version,
so the release workflow sets it (and the tag `dist-v<x.y.z>` it pins the plugin to) only once the
build is there, and pushes that to `main` as `github-actions[bot]`. Pull before your next push. The
release fails unless `marketplace.json` names one released version and its tag.

## Releasing

A release is the plugin alone: the skill, the shim and `.mcp.json`. The shim runs the clone that
`bun run setup` recorded, so every computer that uses Remry has a clone and Bun.

1. `bun run release:version <x.y.z>`
2. Commit and push to `main`.
3. After CI passes, `.github/workflows/release.yml` publishes it.

`scripts/release/plan.ts` skips a version that's already released, and fails if `plugin/` changed
since the last release without a new version.

- **CI** (`.github/workflows/ci.yml`): lint, `check`, unit and integration tests on every push and
  PR, on Linux.
- **Publish:** force-pushes `plugin/` to the root of the `dist` branch — Cowork's sync needs
  `.claude-plugin/plugin.json` at the root — tags that commit `dist-v<version>`, then creates GitHub
  release `v<version>` with `plugin/` zipped, for Claude desktop Chat.

`marketplace.json` points at that tag, so Claude Code, Cowork and `bun run setup` all install the
released plugin.

## Adding a procedure

Claude sees every procedure the CLI and MCP offer, as a tool whose schema sits in its context, so:

- Give it a one-line `.meta({ description })` saying what it does. The MCP test fails without one.
- Prefer a parameter on an existing procedure to a new procedure. A procedure only the app needs
  goes in `APP_ONLY` in `cli/api.ts`.
- Archiving and deleting go through `entity.archive` and `entity.delete`; a new archivable or
  deletable type joins those rather than adding its own.

## Ground rules

Each of these is deliberate. A change that breaks one needs a different design:

- **Local-only, single user.** No users, auth, orgs, permissions or sharing.
- **Notebooks are separate databases, not tenants.** No table has a notebook column, and nothing
  reads or links across notebooks.
- **No LLM, no secrets, no outbound network.** The two model-backed features — `doc.convertPdf` and
  the page Chat tab — run the user's own `claude` CLI and are HTTP-context only, excluded from the
  CLI and MCP. The app holds no key and makes no request itself. Chat conversations are saved per
  entity in the notebook (`page_chat`) until cleared or the entity is deleted.
- **The network boundary is the security boundary** (`src/hooks.server.ts`). Keep all three parts:
  the server binds to `127.0.0.1`; requests whose hostname isn't loopback get 403 (blocks DNS
  rebinding); `/api/trpc` requires the `x-remry: 1` header (blocks cross-site requests).
