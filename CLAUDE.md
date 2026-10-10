# CLAUDE.md — Remry

A local-only, single-user structured notebook: people and groups (teams, departments, families), projects, notes, docs, todos, tags, and branded reports with charts. A more opinionated Obsidian, backed by SQLite.

The user keeps several **notebooks** (work, home life, a side project), each with its own database and files. The app, the CLI and the MCP server work on one notebook at a time.

A notebook's **profile** (`work` or `home`, in its `notebook.json`) is a list of **modules** on top of a shared core (`notebookModel` in `src/shared/modules/model.ts`): `work` has `org` (a person's title and lead, Team and Department groups, the org map) and `goals`; `home` has `personal` (birthday and how you know someone, Family and Friends groups, partner/parent/sibling/friend relations). The core (people, **groups** of kinds the notebook defines, projects, pages, docs, notes, todos, relations, search) never reads a module's tables; modules plug in through person extensions (`src/api/modules/`) and the model, and procedures a notebook's modules don't include are refused (`moduleGate` in `src/shared/trpc/init.ts`). Wiki **page kinds** are data, defined per notebook (`page_kind`), and a kind's pages work as a dataset (`page.query`, `/app/wiki?kind=<key>`): that is how a notebook keeps expenses, recipes, places and the like without new tables.

**Claude is the primary way data gets in**, through the CLI, which calls the app's tRPC API. The web UI is mainly for looking at the data (usually in the Claude desktop browser pane) and for printing reports to PDF.

Scoped docs:

- `src/api/CLAUDE.md`: domains, the Registry, Result, tRPC, reports and the chart spec
- `src/lib/CLAUDE.md`: components, stores, chart rendering, SCSS
- `src/routes/CLAUDE.md`: routes, the files route, print pages
- `prisma/CLAUDE.md`: SQLite schema conventions and migrations
- `tests/CLAUDE.md`: unit and integration tests

## Ground rules

- **Local-only, single user.** There are no users, auth, orgs, permissions or sharing. Don't add them.
- **Notebooks are separate databases, not tenants.** No table has a notebook column, and nothing reads or links across notebooks. Keep it that way: a feature that needs two notebooks at once needs a different design.
- **No LLM, no secrets, no outbound network.** Claude is the intelligence; the app never calls a model or any external service. Don't add API keys, SDKs, analytics, CDNs or remote storage.
  - **One exception:** in the web app, `doc.convertPdf` runs the user's own Claude Code CLI (`claude -p`, only the Read tool) to turn an attached PDF into markdown. The app holds no key and makes no request itself. When `claude` isn't installed, the request returns a warning and the PDF just stays attached. The CLI and MCP don't offer it. The right panel's **Chat** tab (`chat.send`) runs it the same way, with no tools, to discuss the entity page that's open; its prompt is the page's visible text and the conversation. Each entity's conversation is saved in the notebook's database (`page_chat`) until Clear or until the entity is deleted. Don't widen this into other model calls without asking.
- **Data never leaves this Mac.** No cloud sync and no git for data; backups are local snapshots.
- **The network boundary is the security boundary** (`src/hooks.server.ts`). Keep all three parts:
  - the server binds to `127.0.0.1`
  - requests whose hostname isn't loopback get 403 (blocks DNS rebinding)
  - `/api/trpc` requires the `x-remry: 1` header (blocks cross-site requests)

## Stack

- **Runtime:** Bun
- **Framework:** SvelteKit (Svelte 5, TypeScript, SCSS), `@sveltejs/adapter-node`
- **API:** tRPC v11 + Zod over the Fetch adapter. This is the validated API behind both the UI and the CLI.
- **Database:** SQLite through Prisma 7 and `@prisma/adapter-libsql`. The better-sqlite3 adapter does not run under Bun.
- **Content:** marked and Milkdown for markdown, chart.js for charts, mermaid for diagrams, jsPDF and html2canvas-pro for doc PDFs (bundled, loaded only on export)
- **Tests:** Vitest (unit and integration)

## Where code goes

```
src/
├── api/      # Backend-only: domain operations + tRPC routers
├── shared/   # Used by both sides: tRPC, registry, settings, storage, types, utils
├── lib/      # Frontend: components, stores, chart rendering
└── routes/   # SvelteKit routes — thin entry points
```

Ask "who imports this?" Only the backend → `src/api/`. Both → `src/shared/`. Only the frontend → `src/lib/`.

## Writing data with the CLI

The CLI runs the tRPC router in-process against the local database, with the same Zod validation as the app. **The app doesn't need to be running.** `bun run setup` links `bin/remry` onto PATH as `remry`, and either form works from any directory.

```bash
remry help                                   # every procedure
remry help todo.create                       # one procedure's inputs, types and limits
remry person.create --name "Alice Johnson" --extensions '{"org":{"title":"Staff Engineer"}}'
remry personRelation.add --fromId <leadPersonId> --toId <personId> --kind LEAD_OF
remry person.setMe --id <personId>
remry group.create --kind TEAM --name Platform
remry group.addMember --groupId <groupId> --personId <personId>
remry note.add --entityType PERSON --entityId <personId> --content "Wants to lead the migration"
remry todo.create --title "Book 1:1" --entityType PERSON --entityId <personId> --priority 2
remry report.create --entityType PERSON --entityId <personId> --title "Q3 review" --content-file q3.md
remry goal.create --title "99.9% uptime" --ownerType GROUP --ownerId <groupId> --period 2026-H2 --target 99.9
remry goal.checkIn --goalId <goalId> --value 99.7 --status AT_RISK
remry pageKind.create --input '{"key":"EXPENSE","name":"Expense","fields":[{"key":"amount","label":"Amount","input":"number","format":"money","currency":"USD"}]}'
remry page.create --title "Datadog" --kind SOFTWARE --properties '{"vendor":"Datadog","seats":40}'
remry page.query --kind EXPENSE --filters '["amount:gte:100"]' --groupBy category --aggregates '["amount:sum"]'
remry relation.add --fromType GROUP --fromId <groupId> --toType PAGE --toId <pageId> --note "Uses it for alerting"
remry relation.add --fromType PROJECT --fromId <projectId> --toType PROJECT --toId <otherProjectId> --kind DEPENDS_ON
remry search.query --q "vendor renewal -draft"             # full-text search over everything
remry search.recall --entityType PERSON --entityId <personId>  # everything about one entity, in one call
```

- **Output:** stdout is JSON (logs go to stderr). Operations return `{ "ok": true, "value": ... }` or `{ "ok": false, "error": { "message": ... } }`, and the CLI exits 1 on `ok: false`, invalid input or an unknown procedure. The error text is written to be actionable.
- **Notebooks:** every call runs against the default notebook, unless it passes `--notebook <id or name>` (anywhere in the arguments) or `REMRY_NOTEBOOK` is set. `notebook.list`, `notebook.create --name`, `notebook.rename` and `notebook.setDefault` manage them. There is deliberately no delete: the user moves a folder out of `Notebooks/` by hand.
- **Typing:** values are coerced by each procedure's JSON Schema. `--title 2024` stays a string, `--priority 2` becomes a number, and `null` clears a field (`--email null`).
- **Input:** `--<field>-file <path>` reads a value from a file (use it for markdown), and `--input '<json>'` passes the whole input.
- **Entity types:** `PERSON GROUP PROJECT GOAL PAGE DOC NOTE REPORT TODO LINK TAG COMMENT EMOJI`. Docs, notes, todos, reports, links, tags, comments and emoji attach to any entity through `entityType` + `entityId`, except docs on wiki pages (`acceptsDocs` in `src/shared/utils/entity.ts`).
- **Search and recall:** `search.query` is full-text search (SQLite FTS5, kept current by triggers) over names, notes, docs, pages, todos, comments, links and check-ins; `search.recall` returns an entity with everything attached to it and the text elsewhere that names it without linking it. See `src/api/CLAUDE.md` § Search.
- **Links between entities:** projects and goals have an owner (`ownerType` + `ownerId`). `relation.add` links any two entities as `RELATED` (no direction) or `DEPENDS_ON`, with an optional note. Relationships between two people are their own table and API: `personRelation.add --fromId --toId --kind`, of kinds the notebook defines (`personRelationKind.*`: `LEAD_OF` for leads and reports, `PARENT_OF`, `PARTNER_OF`…). In the UI, "+" in an entity's Related section adds either, and People → Relation kinds manages the kinds. One person can be marked as the user (`person.setMe`), and People shows how everyone relates to them. A markdown link to an app path (`/app/wiki/<id>`) in page, doc, note or report content becomes a `MENTIONS` backlink when the content is saved.
- **The Claude skill** in `plugin/skills/remry/` teaches all of this, plus recipes and the chart syntax. `bun run setup` installs it as a Claude Code plugin (see § Claude plugin).

### Importing a PDF

From the CLI or MCP, the app stores PDFs but doesn't read them. (The web app's "Convert with Claude" runs the local `claude` CLI instead; see § Ground rules.) Read the PDF yourself, write the markdown with `doc.add` and `doc.update --content-file`, and optionally attach the original with `doc.attachSource --dataBase64-file` (base64 of the PDF).

### Exporting a doc or wiki page to PDF

A doc's "Export PDF" opens `/app/docs/<id>/print`, and a wiki page's (beside its Content heading, or in its editor) opens `/app/wiki/<id>/print`, which also prints the page's filled-in properties under the title. Both render `src/lib/doc/PrintView.svelte`. **Download PDF** builds the file in the browser (`src/lib/doc/export-pdf.ts`: html2canvas-pro draws the page, jsPDF cuts it into A4 pages at block edges), so its pages are images and the text isn't selectable; **Print…** is the browser's dialog, for a PDF with real text. A line of just `<!-- pagebreak -->` (outside code blocks) starts a new page in both (`markPageBreaks` in `src/lib/doc/pdf-pages.ts`); elsewhere it's an invisible comment. Its toolbar picks the branding (the default, another one, or none) and turns the branded header on (it starts off); the choices live in the URL. It works while reports are switched off.

### Reports and charts

**Reports are switched off while they're unfinished:** `features.reports` in `src/shared/settings/base/features.ts`. Off, the UI hides them (nav, finder, sidebar widget, home feed and graph), `/app/reports` is a 404, and `report.*` is left out of the CLI and MCP. The router, tables and data stay. To turn them back on, set the flag and restore the Reports section of the skill (`plugin/skills/remry/SKILL.md`, `references/schema.md`) and "reports" in the MCP instructions (`cli/mcp.ts`).

Reports are markdown with fenced `chart` blocks, rendered with the report's branding and printed to PDF from `/app/reports/<id>/print`. See `src/api/CLAUDE.md` § Reports and `plugin/skills/remry/references/charts.md`. Invalid chart blocks are rejected on save, and the error names the line.

## Claude plugin and MCP server

The repo is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with one plugin, in `plugin/`:
- the skill
- `plugin/scripts/remry`, the shim `.mcp.json` runs to start the server. It isn't in `bin/`: claude.ai-hosted plugins (Cowork) reject a top-level `bin/`, so `bun run setup` puts `remry` on PATH instead
- `plugin/.mcp.json`, which starts the `remry` MCP server

The shim runs, in order: the clone named by `$REMRY_HOME`; the clone in `<data dir>/app-path`, which `bun run setup` writes (so a development machine runs its own code); or the standalone binary a release carries (see § Releases).

- **MCP server:** `remry mcp` (`cli/mcp.ts`) serves every procedure as a tool over stdio, with `.` written as `_` (`person_create`), plus `backup_snapshot` and `backup_list`. Every tool except `notebook_*` takes an optional `notebook` argument, which `callTool` strips before the call. It uses JSON-RPC and no SDK. The protocol is the pure `handleMessage` in `cli/mcp-protocol.ts`. Queries are marked read-only, and `delete`/`remove`/`detach` tools destructive. stdout carries protocol messages only; the app's logs go to stderr. It's stdio only: no port, no network.
- **Shared calls:** the CLI and the MCP server both call procedures through `cli/api.ts`, so new procedures need no changes in either.
- **Minimal PATH:** Claude desktop starts MCP servers with a minimal PATH. So `.mcp.json` runs the shim with `sh`, and `bin/remry` looks for Bun in `~/.bun/bin`, `/opt/homebrew/bin` and `/usr/local/bin` (or `$REMRY_BUN`).
- **`bun run setup`** does four things:
  - writes the pointer
  - links `remry` into Bun's global bin folder
  - zips `plugin/` into `dist/remry.zip` for Claude desktop Chat and Cowork
  - installs or updates the Claude Code plugin

  `bun run setup uninstall` undoes that. The logic is the pure `planInstall`/`planUninstall` in `scripts/setup/plan.ts`.
- **Why a subdirectory:** the plugin's cache copy holds only the skill, the shim and `.mcp.json`. At the repo root, the whole app would be copied, including the `bin/` folder that claude.ai-hosted plugins reject.
- **Bump the version with `bun run release:version <x.y.z>` whenever the plugin should update.** It sets `plugin/.claude-plugin/plugin.json`, and `package.json` to match. `claude plugin update` and Cowork skip a version they already have.
- **No version in `marketplace.json`.** Clients read it from `main` as soon as it's pushed, minutes before the release reaches the `dist` branch; one that synced in between kept the old plugin under the new version and never updated. So clients take the version from `plugin.json` on `dist`, which arrives with its code, and `plan.ts` fails if `marketplace.json` names one (`checkMarketplace` in `scripts/release/versions.ts`).
- **No repo paths in the skill:** it uses only MCP tools and `remry`. `remry backup …` and `remry app` run the backup script and the dev server.

## Releases

Releases include the app, so a computer that installs the plugin needs no clone and no Bun. They're built for macOS (Apple silicon), Windows (x64) and Linux (x64); Windows and Linux are new, and their builds don't block a release. `main` is where development happens.

- **Releasing:** run `bun run release:version <x.y.z>`, commit and push to main. After CI passes, `.github/workflows/release.yml` publishes it. `scripts/release/plan.ts` skips a version that's already released, and fails if `plugin/` changed since the last release without a new version.
- **CI** (`.github/workflows/ci.yml`): `check`, unit and integration tests on every push and pull request, on Linux. `portability` also runs the unit tests on macOS and Windows, without blocking.
- **Build** (`bun run release:build [--target <t>]`, `scripts/release/build.ts`): builds the UI, then compiles `cli/standalone.ts` and the built SvelteKit server into one `remry-<target>` binary (`.exe` on Windows) with Bun embedded. Targets: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `windows-x64`; the default is this machine. Build a target on its own OS, since the binary embeds the host's libsql native package (the map is in `build.ts`). It writes `dist/plugin/` (the plugin plus `server/`: the binary, with the UI's static files embedded, `migrations/` and `VERSION`).
- **Package** (`bun run release:package [<built plugin dir> ...]`, `scripts/release/package.ts`, pure plan in `package-plan.ts`): merges the binaries of several builds into `dist/plugin`, then zips it once per platform with only that platform's binary: `dist/remry-<version>-<target>.zip`. Each binary is 80–120 MB, so a release carries three platforms, not five. GitHub refuses a file over 100 MB in git, so the `dist` branch (the marketplace plugin) leaves off any binary over 95 MB (`branchBinaries`); that platform's release zip still has it. Today that leaves Linux to the release zip and the desktop app.
- **Windows paths:** Windows can't check out a path with a reserved device name (`con`, `prn`, `aux`, `nul`, `com1`…, `lpt1`…) as any segment, or with `<>:"|?*`. A unit test (`scripts/release/windows-paths.ts`) fails on any such tracked file; `src/api/aux/` became `src/api/attached/` for this.
- **Smoke test** (`bun run release:smoke`, `scripts/release/smoke.ts`): picks this machine's binary, installs it through the shim (`remry.cmd` on Windows) into an empty home folder, then checks a procedure, the MCP tool list and the app (page, asset, API, guard).
- **Publish:** force-pushes the contents of `dist/plugin` to the root of the `dist` branch (Cowork's sync requires `.claude-plugin/plugin.json` at the root and ignores a source `path`), then creates GitHub release `v<version>` with the zips (for Claude desktop Chat, which only takes uploads). The workflow builds and smoke-tests each platform on its own runner, then merges them on Linux.
- **marketplace.json** points the plugin at that branch: `"source": {"source": "github", "repo": …, "ref": "dist"}`. So Claude Code, Cowork and `bun run setup` all install the released plugin; a development machine's MCP server still runs its clone (shim order above).
- **The binary:** `cli/standalone.ts` sets `REMRY_STANDALONE` and `REMRY_MIGRATIONS_DIR`, then runs `mcp`, `backup`, `app` (`cli/app-server.ts`: the SvelteKit server plus static files, on 127.0.0.1:5173) or a procedure. `cli/main.ts` and `cli/mcp.ts` don't chdir to a repo when `REMRY_STANDALONE` is set.
- **Native SQLite:** libsql picks its native module with a runtime `require`, which a bundler can't follow. `scripts/release/libsql.ts` rewrites it into a static require so Bun embeds the module, and fails the build if libsql changes that line.
- **Cowork:** sessions run in a sandbox (a VM on the Mac, or the cloud) that can't see `~/Library/Application Support`. Claude desktop runs the plugin's MCP server on the Mac and bridges its tools into local sessions only, so the tools are the only way in. The skill and the MCP instructions tell Claude never to read the data folder, run `remry` from a sandbox, or ask for the folder to be attached; a SQLite database opened from both the VM and the Mac isn't safe.
- **On the user's computer:** the shim copies the binary (with `cat`, which drops a download quarantine flag) and `migrations/` into `<data dir>/App/<version>`, and points `App/current` at it. On Windows, `plugin/scripts/remry.cmd` does the same with `copy` and a directory junction, so a plugin update never replaces a running `.exe`; under Git Bash the `sh` shim hands over to it. A clone on Windows runs through `cli/clone-entry.ts`, which does what `bin/remry` does. `remry backup install` from a release makes the LaunchAgent run `App/current/remry backup`, which keeps working across updates. The MCP tool `app_open` starts the app in the background. A release app reports its version (`GET /__remry/app`); when the MCP server starts, and on `app_open`, a release replaces an app of a different version (`POST /__remry/app/stop`, loopback and the local header only), so updating the plugin and restarting Claude desktop updates the app too. It never stops what it can't identify, such as a clone's dev server. The plan is the pure `planAppLaunch` in `cli/app-launch.ts`. `app_restart` (MCP) and `remry app restart` (`cli/app-restart.ts`) stop the app explicitly, whatever its version: through the stop endpoint, or by pid for an app without it (a clone's dev server, a release before 0.6.6), and never a process that isn't Remry (`isRemryCommand`). It finds the pid with `lsof` and `ps`, or PowerShell on Windows.

## Remry Pro (licenses)

Three features need a yearly license: **full-text search** (`search.query`, `search.recall`), **branding** (`branding.create/update/delete/uploadImage`, and the app wearing a branding's colours and icon) and **PDF export** (the doc and wiki print pages). Everything else is free, and nothing stored is touched when a license lapses: brandings stay listed, and it all comes back with a renewed key.

- **Keys are checked offline.** A key is `WN1.<base64url payload>.<base64url Ed25519 signature>`; the payload is `{ v, id, name, email, plan: 'pro', issued, expires }`, good through `expires` (UTC). `verifyLicenseKey` (`src/shared/license/verify.server.ts`) checks it against `settings.licensePublicKey`: the real key in `src/shared/license/public-key.ts` for development and production, and a test-only key under `APP_ENV=test` (its private half is `tests/license-test-key.ts`, outside the app). No network, ever.
- **One license per computer:** `licenseKey` in `<data dir>/settings.json` (beside `defaultNotebook`; `src/shared/settings/server/root-settings.server.ts` reads and writes that file, keeping other keys), read on every check (`currentLicense` in `src/shared/license/store.server.ts`), so the app, CLI and MCP server agree at once. `license.status`, `license.activate --key` (refuses an invalid or expired key) and `license.remove`; the app's page is `/app/license`, in the notebook menu (the chevron beside the notebook name), and every Pro notice links to it.
- **Gating:** routes wrap a Pro operation in `gated(ctx, feature, run)` (`src/api/_license.ts`), which returns `err(lockedMessage(…))` without an active license: a message that says what to do, for Claude (`tool`) or the app (`app`). `ctx.license` is on the tRPC context. The `/app` layout loads `license` and drops the branded theme without one; the print pages' loads return `locked` and render `ProLock` (`src/lib/ui/ProLock.svelte`); `ProBadge` marks a locked control. Feature names and messages are `src/shared/types/license.ts`.
- **Issuing keys** (the seller, never the app): `bun run license:keygen` makes the signing keypair once, writes the private key outside the repo (`~/.remry-license/private.pem`, never commit it; `*.pem` is ignored) and rewrites `public-key.ts`. `bun run license:issue --name --email [--months 12] [--from <old expiry + 1 day>] [--renews <id>]` prints a key. A new keypair invalidates every key issued with the old one, so do it once.
- **Selling keys** happens outside this repo. A Stripe Payment Link sells a yearly subscription, with Stripe Managed Payments as merchant of record. jweatherby.dev (the `jweatherby.dev` repo: Vercel functions `api/remry/stripe.ts` and `api/remry/license.ts`, and the page `/remry/thanks`) issues the keys:
  - On every `invoice.paid` it signs a key and emails it. The id is `stripe-<subscription id>`, so a renewal keeps the id. The expiry is the last UTC day of the paid period.
  - The thanks page shows the same key.
  - It signs with the same private key as `license:issue`, through a port of `signLicenseKey`. Its tests check its keys with a copy of `readLicensePayload` and the test keypair, so change the key format there too.
  - The app only links to it: `REMRY_LINKS` in `src/shared/types/site.ts` (buy: the Payment Link, a placeholder until it exists; help: the README's Remry Pro section), used by the License page and `lockedMessage`. The app never sends it a request.
- **Refunds:** `bun run license:revoke --key <latest key> [--reason refund]` (or `--id <id> --expires <date>`) adds the license to `src/shared/license/revoked.ts`, which ships with each release: `verifyLicenseKey` treats a listed id as invalid ("refunded or revoked"), so the key stops working once the app updates, with no network. A renewal keeps its id, so revoking covers it. Each entry carries the license's expiry, and every run of the script drops entries past it (those keys have expired anyway), so the list stays short; `--prune` does only that. Ids only, never names or emails. Pure logic in `scripts/license/revoke-list.ts`.
- **It's an honour system,** like any check in a public codebase: it's there so paying is easy and fair, not to stop someone determined. Don't add obfuscation, phoning home or anything that could lock a user out of their own data.

## Desktop app

`desktop/` is a Tauri 2 app: a window on the local server, for every platform, and the way Windows users connect Claude (the plugin's `sh` launcher doesn't run there). It's a preview: built by hand (`.github/workflows/desktop.yml`, unsigned) and not part of the release yet.

- **A thin shell.** `desktop/src-tauri/src/main.rs` only runs the `remry` binary it bundles as a sidecar (the release binary, placed by `bun run desktop:prepare` as `binaries/remry-<rust triple>`, with `migrations/` and `VERSION` as resources). The logic is in TypeScript, in `cli/desktop.ts` (pure parts in `cli/desktop-plan.ts`):
  - `remry install` copies the running binary, its migrations and VERSION into `<data dir>/App/<version>` and points `App/current` at it, as the plugin shim does. The app passes `REMRY_VERSION` and `REMRY_MIGRATIONS_DIR`, since its sidecar has no files beside it.
  - `remry app ensure` starts the server or reuses it (`openApp`, so a different version is replaced), and prints its address. The app runs this on the installed copy, so an app update never replaces a running binary.
  - `remry connect claude-desktop|claude-code` registers `App/current/remry mcp` as the `remry` MCP server: in Claude desktop's `claude_desktop_config.json` (keeping everything else, refusing a file it can't parse, keeping a `.bak` once), or with `claude mcp add --scope user`.
- **The window** opens `desktop/ui/index.html` ("Starting…", or the error), then navigates to `http://127.0.0.1:5173/app`. The page gets no Tauri IPC (`capabilities/default.json` grants nothing), so it's the same web app a browser shows, behind the same `hooks.server.ts` boundary. Any other address opens in the default browser (`is_app_url`, tested with `cargo test`). The server keeps running when the window closes.
- **The Claude menu** has "Connect to Claude desktop…" and "Connect to Claude Code…". Each asks first, because it changes another app's settings, and says to skip it when the plugin is installed.
- `bun run desktop:dev` / `desktop:build` run `tauri dev` / `tauri build` in `desktop/` (after `release:build` and `desktop:prepare`). Linux needs `libwebkit2gtk-4.1-dev` and friends.

## Local state (like a native app)

- **Where it lives:** `~/Library/Application Support/Remry/` on macOS, `%LOCALAPPDATA%\Remry\` on Windows (local, not roaming), `$XDG_DATA_HOME/remry` on Linux (`dataDirFor` in `src/shared/settings/server/app-dirs.ts`, pure):
  - `settings.json` — `defaultNotebook`, the notebook the CLI and MCP use when none is named, and `licenseKey`, the Pro license
  - `Notebooks/<id>/notebook.json` — the notebook's name and profile
  - `Notebooks/<id>/working-notes.db` — SQLite, WAL mode, so the app, CLI and backups can use it at the same time
  - `Notebooks/<id>/files/` — uploaded PDFs and branding images
  - `Backups/<id>/` — that notebook's snapshots, outside its folder so they outlive it
  - `app-path` — the clone `bun run setup` points the plugin at
- **Which notebook:** `resolveNotebook` (`src/shared/notebooks/resolve.ts`, pure). The CLI and MCP use the named notebook, then `REMRY_NOTEBOOK`, then the default. The UI uses `?notebook=<id>`, then its `wn-notebook` cookie, then the default, so switching in the browser never changes where Claude writes.
- **First run:** nothing to set up. `ensureLayout()` (`src/shared/notebooks/layout.server.ts`) runs before any database opens. A fresh data directory gets a notebook called `notebook`. A data directory from before notebooks (a `working-notes.db` at the top) is moved, by renames only, into the notebook `work-work`, snapshots included. It refuses while another process (the old app, an MCP server) has that database open. Then `ensureDatabase(notebookId)` (`src/shared/db/bootstrap.server.ts`) applies pending migrations with a Prisma-compatible in-process migrator, the first time each process touches each notebook.
- **Dev and prod** share these notebooks. Integration tests use `./data/test` (`APP_ENV=test`) and refuse to run against anything else.

## Backups

`bun run backup` snapshots each notebook whose data changed: a consistent `VACUUM INTO` copy of its database, its files (unchanged ones hard-linked from the previous snapshot), and a `manifest.json` naming the notebook. Add `--notebook <id>` to `run`, `list` or `restore` to work on one.

- **Hourly, on every platform:** the MCP server and the release app each check every 5 minutes and snapshot every changed notebook once an hour (`scripts/backup/schedule.ts`). A lock file (`Backups/.lock`, taken over after 15 minutes) lets one process do it, and `Backups/.last-run` makes the others skip the hour. So backups run whenever Claude or the app is open, with no OS scheduler.
- `bun run backup install` (macOS) also adds one hourly LaunchAgent (`dev.jweatherby.remry.backup`), for backups while nothing else is running; `uninstall` removes it. It shares the hour, and the lock, with the processes above. The log is `~/Library/Logs/Remry/backup.log`. A manual `backup` run takes the lock too, and says so when another process holds it.
- `bun run backup --force --reason "<why>"` snapshots regardless. Do this before bulk or destructive changes.
- `bun run backup list` shows snapshots with counts, per notebook.
- `bun run backup restore <id|latest> --notebook <id>` refuses while the app is running on 5173, checks the snapshot's integrity, snapshots the current data first, then restores and migrates forward. `--notebook` may be left out only when there is one notebook.
- **Retention:** per notebook, everything from the last 48h, then one per day for 30 days, then one per week for 26 weeks, and always the 3 newest.
- **Snapshots stay on this disk,** so they don't protect against disk failure. Time Machine does, and it backs up Application Support automatically.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on http://127.0.0.1:5173 |
| `bun run build && bun run start` | Production server, loopback only |
| `bun run check` | svelte-check, plus tsc for `cli/` and `scripts/` |
| `bun run test` | Unit tests (`src/`, `cli/`, `scripts/`) |
| `bun run test:integration` | Integration tests against `./data/test` |
| `remry <procedure> [--field value] [--notebook <id>]` | Call the API in-process (also `bin/remry`, `bun run remry`) |
| `remry app` | Dev server, from any directory |
| `remry app restart` | Stop the running app and start it again |
| `remry mcp` | MCP server on stdio, for Claude desktop Chat, Cowork and Claude Code |
| `bun run backup [list\|restore\|install\|uninstall] [--notebook <id>]` | Snapshots and restore (also `remry backup`) |
| `bun run release:version <x.y.z>` | Set the plugin version; pushing it to main releases it |
| `bun run release:build` / `release:package` / `release:smoke` | Build this platform's standalone plugin into `dist/`, zip it (merging other platforms' builds), and smoke-test it |
| `bun run desktop:prepare` / `desktop:dev` / `desktop:build` | Put the release binary into the Tauri app, then run it or build its installers |
| `bun run setup [uninstall]` | Put `remry` on PATH, build the Claude desktop plugin zip, and install or remove the Claude Code plugin |
| `bun run db:migrate --name <change>` | Author a migration against the default notebook, or `REMRY_NOTEBOOK` (a real notebook; `bun run backup --force` first). Other notebooks migrate forward when next opened |
| `bun run db:studio` | Prisma Studio, on the same notebook |

## Settings

Config is plain TypeScript in `src/shared/settings/`: `base/` is client-safe and `server/` is server-only. `APP_ENV` selects `development` (default), `production` or `test`. There are no secrets and no `.env` files.

- The only server setting is `dataDir` (`server/app-dirs.ts` gives the native location).
- `server/paths.ts` derives every path from it. Per-notebook paths take the notebook id and throw on an id that isn't a valid slug (`isNotebookId`), so an id can never become a path outside `Notebooks/`.
- Processes run from the repo root, so `prisma/migrations` resolves; the CLI changes to the repo directory itself.

## Renamed from Wonos and Working Notes

The product was called Wonos (command `wono`, plugin and MCP server `wonos`), and before that Working Notes (command `wnotes`). What still reads the old names, so existing installs move over by themselves (remove it once no one runs a release before the renames):

- **Data folder:** `moveLegacyDataDir` (`src/shared/settings/server/legacy-data-dir.ts`, plan `planLegacyMove`) runs from `appDataDir()`, once per process, for each earlier folder in turn (`legacyDataDirsFor`: `Wonos`, then `Working Notes`). It renames `Notebooks/` first, then everything else the new folder lacks, except `App/` (old binaries) and an earlier rename's note, and leaves `MOVED-TO-REMRY.txt`. While another process has an old database open (lsof), it keeps the old folder for that process; `migrateLayout` refuses to start an empty notebook in a folder whose data has moved (either note). The MCP server stops an old app (`stopStaleApp`) before it opens the data directory. The database file is still `working-notes.db`, so snapshots and restores need no change.
- **App control:** `probeApp` and `stopApp` also try `/__wono/app` and `/__wnotes/app` with the `x-wono` and `x-working-notes` headers, and `isRemryCommand` recognises `wono`, `wonos`, `wnotes` and `working-notes`.
- **Names:** `bin/wono` and `bin/wnotes` run `bin/remry`; `WONO_NOTEBOOK` and `WNOTES_NOTEBOOK` (`notebookFromEnv`), `WONO_BUN`, `WNOTES_BUN`, `WONO_HOME` and `WORKING_NOTES_HOME` are still read; the plugin shim also reads `app-path` from the old folders; the license scripts fall back to `~/.wonos-license/`, then `~/.working-notes-license/` (`defaultPrivateKeyPath`). License keys keep the `WN1.` prefix.
- **Elsewhere:** `bun run setup` removes the `wonos` and `working-notes` plugins and marketplaces; `remry connect` replaces a `wonos` or `working-notes` MCP server that runs `wono` or `wnotes`; the backup schedule and `backup install` replace the `dev.jweatherby.wonos.backup` and `dev.jweatherby.working-notes.backup` LaunchAgents (`replaceLegacyAgent`).
- **Repo:** the code moved to `remry-ai/remry`, starting a fresh history; the old repo is `jweatherby/working-notes`. The marketplace and release links name the new one.

## Coding conventions

- **Pure functions first.** Side effects (DB, storage, time, ids) come in through the Registry.
- **`readonly` properties** on all interfaces and return types.
- **Interfaces over type aliases** for public contracts.
- **No `any`.** Use `unknown` and narrow.
- **Explicit return types** on exported functions.
- **`Result<T>`** (`$shared/utils/result`) for operations that can fail. Don't throw in business logic.
- **No barrel re-exports from domains.** Import the file you need.
- **`const` arrow functions** over `function` declarations.
- **No code in `index.ts`.** Name files explicitly.
- **UI uses the standard components.** Pages, forms, popups, destructive actions, empty states and styles follow `src/lib/CLAUDE.md` § Rules for UI code. Extend a primitive in `src/lib/ui/`; don't write a one-off.
