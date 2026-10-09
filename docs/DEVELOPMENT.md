# Development

You need [Bun](https://bun.sh). Claude Code and the Claude desktop app are optional.

```bash
git clone <repo-url> remry
cd remry
bun install
bun run setup              # put `remry` on PATH and install the Claude plugin
remry app                 # the UI at http://127.0.0.1:5173
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
4. Installs or updates the Claude Code plugin, from this clone as a local marketplace.

The pointer matters: because of it, the plugin's MCP server runs **this clone's code** instead of a
release's. The shim, `plugin/scripts/remry`, tries three sources in order — `$REMRY_HOME`,
the clone named by `app-path`, then the standalone binary inside a release. A development machine
therefore always runs the code it has checked out.

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
| `bun run check` | svelte-check, plus tsc for `cli/` and `scripts/` |
| `bun run test` | Unit tests (`src/`, `cli/`, `scripts/`) |
| `bun run test:integration` | Integration tests against `./data/test` |
| `bun run backup [list\|restore\|install\|uninstall]` | Snapshots and restore |
| `bun run db:migrate --name <change>` | Author a migration against the default notebook |
| `bun run db:studio` | Prisma Studio, on the same notebook |
| `bun run setup [uninstall]` | PATH, plugin zip, Claude Code plugin |
| `bun run desktop:prepare` then `desktop:dev` / `desktop:build` | The Tauri desktop app in `desktop/` (after `release:build`) |

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

It sets `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and `package.json`
together. `claude plugin update` and Cowork skip a version they already have.

## Releasing

A release includes the app, so a Mac that installs the plugin needs no clone and no Bun.

1. `bun run release:version <x.y.z>`
2. Commit and push to `main`.
3. After CI passes, `.github/workflows/release.yml` publishes it.

`scripts/release/plan.ts` skips a version that's already released, and fails if `plugin/` changed
since the last release without a new version.

- **CI** (`.github/workflows/ci.yml`): `check`, unit and integration tests on every push and PR,
  on Linux, plus the unit tests on macOS and Windows (not blocking).
- **Build** (`bun run release:build [--target <t>]`): builds the UI, then compiles
  `cli/standalone.ts` and the built SvelteKit server into one `remry-<target>` binary with Bun
  embedded. Build each target on its own OS: the binary embeds the host's SQLite native module.
  Writes `dist/plugin/`.
- **Package** (`bun run release:package [<built plugin dirs>]`): merges several builds' binaries
  into `dist/plugin` and writes one `dist/remry-<version>-<target>.zip` per platform.
- **Smoke test** (`bun run release:smoke`): installs this machine's binary through the shim
  (`remry.cmd` on Windows) into an empty home folder, then checks a procedure, the MCP tool list
  and the app (page, asset, API, guard).
- **Publish:** the workflow builds and smoke-tests `darwin-arm64` (required), `windows-x64` and
  `linux-x64` on their own runners, packages them on Linux, force-pushes `dist/plugin` to the root
  of the `dist` branch — Cowork's sync needs `.claude-plugin/plugin.json` at the root — then
  creates GitHub release `v<version>` with the zips.

`marketplace.json` points at that branch, so Claude Code, Cowork and `bun run setup` all install the
released plugin; a development machine's MCP server still runs its clone.

**Native SQLite:** libsql picks its native module with a runtime `require`, which a bundler can't
follow. `scripts/release/libsql.ts` rewrites it into a static require so Bun embeds the module, and
fails the build if libsql changes that line.

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
