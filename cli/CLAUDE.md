# CLI and MCP server — `cli/`

`remry` is how Claude writes data. The CLI and the MCP server both run the tRPC router in-process against the local database, through `api.ts`, with the same Zod validation as the app. The app doesn't need to be running. A new procedure needs no change here: give it a `.meta({ description })` (the MCP integration test fails on a tool without one).

## The CLI

```bash
remry help                                   # every procedure
remry help todo.create                       # one procedure's inputs, types and limits
remry person.create --name "Alice Johnson" --extensions '{"org":{"title":"Staff Engineer"}}'
remry personRelation.add --fromId <leadId> --toId <personId> --kind LEAD_OF
remry group.create --kind TEAM --name Platform
remry note.add --entityType PERSON --entityId <personId> --content "Wants to lead the migration"
remry todo.create --title "Book 1:1" --entityType PERSON --entityId <personId> --priority 2
remry page.create --title "Subscriptions" --bodyType sheet --content '{"columns":[{"title":"Service"}],"data":[["Netflix"]]}'
remry relation.add --fromType PROJECT --fromId <id> --toType PROJECT --toId <otherId> --kind DEPENDS_ON
remry search.query --q "vendor renewal -draft"
remry search.recall --entityType PERSON --entityId <personId>
```

- **Output:** stdout is JSON, `{ "ok": true, "value": … }` or `{ "ok": false, "error": { "message": … } }`; logs go to stderr. It exits 1 on `ok: false`, invalid input or an unknown procedure.
- **Notebook:** the default, unless `--notebook <id or name>` (anywhere in the arguments) or `REMRY_NOTEBOOK`.
- **Typing:** values are coerced by each procedure's JSON Schema: `--title 2024` stays a string, `--priority 2` becomes a number, `null` clears a field.
- **Input:** `--<field>-file <path>` reads a value from a file (markdown, base64), `--input '<json>'` passes the whole input.
- `bin/remry` finds Bun in `~/.bun/bin`, `/opt/homebrew/bin` or `/usr/local/bin` (or `$REMRY_BUN`), since Claude desktop starts MCP servers with a minimal PATH. On Windows a clone runs through `clone-entry.ts`, which does the same.

## The MCP server (`mcp.ts`)

`remry mcp` serves procedures as tools over stdio (`.` written as `_`: `person_create`), plus `backup_snapshot`, `backup_list`, `app_open` and `app_restart`. JSON-RPC with no SDK; the protocol is the pure `handleMessage` in `mcp-protocol.ts`. stdout carries protocol messages only. No port, no network.

- **Descriptions:** each tool's is its procedure's one-line `.meta({ description })`; the server instructions (`INSTRUCTIONS`) say the rest once. Queries are marked read-only, `delete`/`remove`/`detach` tools destructive.
- **Notebook:** every tool but `notebook_*` takes an optional `notebook` argument, which `callTool` strips.
- **A lean tool list:** every schema sits in Claude's context, so the list stays short (the MCP test caps it). `APP_ONLY` in `api.ts` leaves out what only the app needs: per-type archive/delete (`entity.archive` and `entity.delete` cover every type), the app's own views, and the procedures that run the user's AI assistant. Prefer a parameter on an existing procedure to a new one.
- **Lean results:** JSON without indentation, fields that are null or an empty list left out (`leaveOutEmpty`). The CLI's output is unchanged.
- **Links:** the item a get, create or update returns gets a `url` beside its `/app` `path` (`withAppLinks`, `app-links.ts`): the app's address, the notebook and `open=app`, so the link opens in the desktop app. List rows keep only `path`.
- **Files:** a result with an `attachment` (`link.read` of an image or PDF) goes out as an image part or an embedded PDF resource (`withAttachment`), not base64.
- **JSON in text fields:** a sheet's or drawing's `content` is JSON in a string field; `stringifyTextArguments` writes an object Claude sends there as its JSON.

## Keeping up with updates

- **A clone after `git pull`** (`version-check.ts`, pure `planVersionCheck`): when the server starts and the clone's plugin version differs from `<data dir>/setup.json`, it runs `bun run setup` in the background, once (`.setup.lock`, log in `setup.log`). Skipped under `APP_ENV=test`.
- **A server older than what's installed** (`newer-install.ts`): before each call it reads the installed version (`App/current/VERSION`, or the clone's `plugin.json`); when that's newer, the call runs through the installed `remry` as a CLI call, since an update may have migrated the notebook past what this version's queries know.

## Running the app

- `remry app` starts the dev server on 5173 (`DEV_PORT`); a release binary's app (`app-server.ts`) is the SvelteKit server plus its static files on 127.0.0.1:7369 (`APP_PORT`). Both can run side by side; `AppOwner.port` says which one `app_open` and `app_restart` use.
- A release app reports its version (`GET /__remry/app`). The MCP server and `app_open` replace an older one, never a newer one (`POST /__remry/app/stop`, loopback and the local header only; pure `planAppLaunch` in `app-launch.ts`). Something on the release port that reports no version is replaced by pid only if its command line is Remry (`isRemryCommand`); otherwise `app ensure` fails with a message naming it. An app counts as up once it answers.
- `app_restart` / `remry app restart` (`app-restart.ts`) stop the app through the stop endpoint, or by pid for a dev server, and never a process that isn't Remry.

## The standalone binary

`standalone.ts` sets `REMRY_STANDALONE` and `REMRY_MIGRATIONS_DIR`, then runs `mcp`, `backup`, `install`, `connect`, `app`, `app ensure`, `app restart` or a procedure. `main.ts` and `mcp.ts` don't chdir to a repo when `REMRY_STANDALONE` is set. `desktop.ts` (pure parts in `desktop-plan.ts`) holds what the desktop app runs: see `desktop/CLAUDE.md`.
