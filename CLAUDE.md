# CLAUDE.md — Remry

A local-only, single-user structured notebook: people and groups, projects, goals, notes, docs and wiki pages (with charts, exported to branded PDFs), todos and tags. A more opinionated Obsidian, backed by SQLite.

**Claude is the primary way data gets in**, through the `remry` CLI and MCP server, which call the app's tRPC API. The web app (often in the Claude desktop browser pane, or the desktop app's window) is mainly for looking at the data and exporting PDFs.

## The model

- **Notebooks:** the user keeps several (work, home life, a side project), each its own database and files. The app, CLI and MCP server work on one at a time.
- **Profiles and modules:** a notebook's profile (`work` or `home`) is a list of modules on a shared core (`notebookModel`, `src/shared/modules/model.ts`): `work` adds `org` (titles, leads, teams and departments, the org map) and `goals`; `home` adds `personal` (birthdays, families and friends, family relations). The core never reads a module's tables, and procedures a notebook's modules lack are refused (`moduleGate`).
- **Entities:** people, groups (of kinds the notebook defines), projects, goals and wiki pages; docs, notes, todos, links, tags and comments attach to any of them. Wiki pages and docs are a doc (markdown), a spreadsheet or a drawing (`$shared/types/body-types`), with no kinds or fields.

## Ground rules

- **Local-only, single user.** No users, auth, orgs, permissions or sharing.
- **Notebooks are separate databases, not tenants.** No table has a notebook column, and nothing reads or links across notebooks.
- **No LLM, no secrets, no outbound network.** Claude is the intelligence; the app never calls a model or an outside service. No API keys, SDKs, analytics, CDNs or remote storage. The exceptions, each narrow and on the user's request:
  - running the user's own AI assistant CLI for Convert, Re-read, Chat, `/ask` and Sync now (`src/shared/assist/CLAUDE.md`)
  - the user's `tailscale` CLI, to open the app on their other devices (`src/shared/remote/CLAUDE.md`)
  - Excalidraw share links, an encrypted copy of a drawing to and from `json.excalidraw.com` (`src/lib/drawing/CLAUDE.md`)
  - the desktop app's signed updates from GitHub releases (`desktop/CLAUDE.md`)

  Don't widen any of them without asking.
- **Data never leaves the computer.** No cloud sync and no git for data; backups are local snapshots.
- **The network boundary is the security boundary** (`src/hooks.server.ts`). Keep all three parts: the server binds to `127.0.0.1`; a request whose hostname isn't loopback gets 403 (blocking DNS rebinding), except the user's own tailnet name when they've turned that on; and `/api/trpc` requires the `x-remry: 1` header (blocking cross-site requests).
- **A Content Security Policy** (`kit.csp` in `svelte.config.js`) runs scripts only from the app's own files. Markdown renders raw HTML and content often comes from outside, so this is what stops a `<script>`, `onerror=` or `javascript:` link in a note from running with full API access. An inline script needs `nonce="%sveltekit.nonce%"`; never add `unsafe-inline` or `unsafe-eval` to `script-src`.

## Stack

Bun · SvelteKit (Svelte 5, TypeScript, SCSS, `adapter-node`) · tRPC v11 + Zod over the Fetch adapter, the one validated API behind the UI and the CLI · SQLite through Prisma 7 and `@prisma/adapter-libsql` (better-sqlite3 doesn't run under Bun) · marked and Milkdown for markdown, chart.js, mermaid, Excalidraw, pdfmake (each loaded only where needed) · Vitest · Tauri 2 for the desktop app.

## Where things are

```
src/api/      backend only: domain operations and tRPC routers
src/shared/   used by both sides: tRPC, registry, settings, storage, types, utils
src/lib/      frontend: components, stores, chart rendering
src/routes/   SvelteKit routes, thin entry points
cli/          the remry CLI, MCP server and standalone binary
plugin/       the Claude Code plugin (skill, shim, .mcp.json); ships to users
desktop/      the Tauri shell
scripts/      setup, release, backup, license and build scripts
prisma/       schema and migrations
tests/        integration tests
```

Ask "who imports this?": only the backend → `src/api/`; both → `src/shared/`; only the frontend → `src/lib/`.

Each area has its own CLAUDE.md with the specifics; read the one for the code you're in:

| Guide | Covers |
|---|---|
| `src/api/CLAUDE.md` | domains, the Registry, `Result`, tRPC, deletes, converting, archiving, relations, search, notebooks, modules, wiki pages, sync docs, files, charts |
| `src/lib/CLAUDE.md` | components, stores, the design system, UI rules |
| `src/lib/doc/CLAUDE.md` | print pages and PDF export |
| `src/lib/drawing/CLAUDE.md` | drawings and Excalidraw |
| `src/routes/CLAUDE.md` | routes, the files route, print pages, styles |
| `src/shared/notebooks/CLAUDE.md` | the data folder, which notebook, first run, settings |
| `src/shared/assist/CLAUDE.md` | running the user's AI assistant |
| `src/shared/remote/CLAUDE.md` | opening the app on other devices |
| `src/shared/license/CLAUDE.md` | Remry Pro: what's gated, keys |
| `cli/CLAUDE.md` | the CLI, the MCP server, running the app |
| `scripts/setup/CLAUDE.md` | the Claude plugin, setup, versions |
| `desktop/CLAUDE.md` | the desktop app |
| `scripts/release/CLAUDE.md` | CI, builds, signing, publishing |
| `scripts/backup/CLAUDE.md` | snapshots and restore |
| `prisma/CLAUDE.md` | schema conventions and migrations |
| `tests/CLAUDE.md` | unit and integration tests |

The skill in `plugin/skills/remry/` is what Claude reads to use Remry; keep it in step when behaviour Claude relies on changes.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on http://127.0.0.1:5173 (the desktop app's server is on 7369, so both can run) |
| `bun run lint` / `bun run check` | ESLint; svelte-check plus tsc for `cli/` and `scripts/` |
| `bun run test` / `bun run test:integration` | Unit and component tests; integration tests against `./data/test` |
| `remry <procedure> [--field value] [--notebook <id>]` | Call the API in-process (`remry help` lists them) |
| `remry mcp` / `remry app` | The MCP server on stdio; the dev server from any directory |
| `bun run backup [list\|restore\|install]` | Snapshots and restore |
| `bun run setup` | Put `remry` on PATH and install this clone's plugin as `remry-dev` |
| `bun run release:version <x.y.z>` | Set the version; pushing it to main releases it |
| `bun run db:migrate --name <change>` | Author a migration (`bun run backup --force` first) |

Before pushing, run lint, check, and both test suites.

## Coding conventions

- **Pure functions first.** Side effects (database, storage, time, ids) come in through the Registry.
- **`Result<T>`** (`$shared/utils/result`) for operations that can fail; don't throw in business logic. Error messages say what to do.
- `readonly` properties on interfaces and return types; interfaces over type aliases for public contracts; no `any` (use `unknown` and narrow); explicit return types on exports; `const` arrow functions.
- No barrel re-exports from domains, and no code in `index.ts`: import the file you need.
- **UI uses the standard components** (`src/lib/CLAUDE.md` § Rules for UI code). Extend a primitive in `src/lib/ui/`; don't write a one-off.
- Keep the CLAUDE.md files current: change the guide next to the code you change, and keep this one high-level.
