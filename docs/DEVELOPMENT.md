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

The pointer matters: the plugin carries no app. Its shim, `plugin/scripts/remry`, tries
`$REMRY_HOME`, then the desktop app's installed binary, then the clone named by `app-path`.
`remry-dev`, setup's copy of the plugin, sets `REMRY_HOME` to this clone, so it runs **this clone's
code** even where the desktop app is installed.

- **Moved the clone?** Run `bun run setup` again from the new location.
- **Update:** `git pull && bun install`. When the plugin version changed, the next Claude session's
  MCP server runs `bun run setup` in the background (log: `<data dir>/setup.log`) and restarts an
  app it started on the old version. Running setup yourself still works.
- **Uninstall:** `bun run setup uninstall`. Your notebook data is not touched.

The install and uninstall logic is the pure `planInstall`/`planUninstall` in
`scripts/setup/plan.ts`.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on http://127.0.0.1:5173 (the desktop app's is on 7369, so both can run) |
| `bun run build && bun run start` | Production server, loopback only |
| `bun run lint` | ESLint for TypeScript and Svelte (`lint:fix` fixes what it can) |
| `bun run check` | svelte-check, plus tsc for `cli/` and `scripts/` |
| `bun run test` | Unit tests (`src/`, `cli/`, `scripts/`) |
| `bun run test:integration` | Integration tests against `./data/test` |
| `bun run backup [list\|restore\|install\|uninstall]` | Snapshots and restore |
| `bun run db:migrate --name <change>` | Author a migration against the default notebook |
| `bun run db:studio` | Prisma Studio, on the same notebook |
| `bun run setup [uninstall]` | PATH, plugin zip, Claude Code plugin |
| `bun run release:build` then `release:smoke` | This platform's `remry` binary in `dist/app/`, smoke-tested |
| `bun run desktop:prepare` then `desktop:dev` / `desktop:build` | The Tauri desktop app in `desktop/` (after `release:build`) |
| `bun run desktop:updater-key` | The keypair desktop updates are signed with (once) |

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

A release is the desktop app for macOS (Apple silicon) and Windows (x64), with the `remry` binary
inside it, and the plugin: the skill, the shim and `.mcp.json`. The plugin's shim runs the desktop
app's installed binary, or a clone.

1. `bun run release:version <x.y.z>`
2. Commit and push to `main`.
3. After CI passes, `.github/workflows/release.yml` builds the desktop app on each platform
   (`.github/workflows/desktop.yml`) and publishes it.

`scripts/release/plan.ts` skips a version that's already released, and fails if `plugin/` changed
since the last release without a new version.

- **CI** (`.github/workflows/ci.yml`): lint, `check`, unit and integration tests on every push and
  PR, on Linux.
- **Build** (`desktop.yml`, which you can also run by hand from the Actions tab to try a build):
  `bun run release:build` compiles `cli/standalone.ts` and the built UI into one `remry` binary
  with Bun embedded (`dist/app/`), `bun run release:smoke` installs and exercises it,
  `bun run desktop:prepare` puts it into the Tauri app as its sidecar, and `bun run desktop:build`
  makes the installer. Build each platform on its own OS: the binary embeds the host's SQLite
  native module.
- **Updates:** run `bun run desktop:updater-key` once (it asks nothing; the key has no password),
  commit the public key it writes into `desktop/src-tauri/tauri.conf.json`, and set the private key
  as the `TAURI_SIGNING_PRIVATE_KEY` secret from the file it prints, with `gh secret set`. Builds then make signed updates, and the release publishes `latest.json`, which installed
  apps check when they open. Without the secret, installed apps keep their version.
- **Signing:** the macOS app is signed with a Developer ID and notarized once the `APPLE_*` secrets
  below are set; until then it's signed ad hoc and macOS warns on first open (see INSTALL.md).
  Windows isn't code-signed, so SmartScreen warns.

### Signing the macOS app

You need an Apple Developer Program membership. Then, once:

1. **Certificate.** In Xcode → Settings → Accounts → Manage Certificates, add a **Developer ID
   Application** certificate (or create one at developer.apple.com with a certificate signing
   request from Keychain Access). In Keychain Access, export it with its private key as a `.p12`
   with a password.
2. **Identity.** `security find-identity -v -p codesigning` prints its name, such as
   `Developer ID Application: Your Name (TEAMID)`.
3. **Notarization key.** In App Store Connect → Users and Access → Integrations → App Store Connect
   API, create a team key with the Developer role. Note its Key ID and the Issuer ID, and download
   the `AuthKey_<Key ID>.p8` (it can only be downloaded once).
4. **Secrets**, from files so nothing passes through the clipboard:

   ```bash
   base64 -i DeveloperID.p12 | gh secret set APPLE_CERTIFICATE
   gh secret set APPLE_CERTIFICATE_PASSWORD
   gh secret set APPLE_SIGNING_IDENTITY --body "Developer ID Application: Your Name (TEAMID)"
   gh secret set APPLE_API_ISSUER --body "<Issuer ID>"
   gh secret set APPLE_API_KEY --body "<Key ID>"
   gh secret set APPLE_API_PRIVATE_KEY < AuthKey_<Key ID>.p8
   ```

The next build signs with the identity, notarizes and staples the app, and checks it passes
Gatekeeper. Run `desktop.yml` by hand from the Actions tab to try it before a release. Once a
signed release is out, drop the Mac step from INSTALL.md.
- **Publish:** force-pushes `plugin/` to the root of the `dist` branch — Cowork's sync needs
  `.claude-plugin/plugin.json` at the root — tags that commit `dist-v<version>`, then creates
  GitHub release `v<version>` with the installers, the signed updates, `latest.json` and the
  plugin zipped, for Claude desktop Chat.

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
