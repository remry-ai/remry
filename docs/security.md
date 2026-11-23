# Remry security inventory

What the app does, taken from the code in this repository at version 0.17.0 (November 2026). Each claim cites the file that does it. **UNVERIFIED** marks anything that couldn't be confirmed from the code or the release build logs.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Summary

- Remry is a single-user notebook. It stores everything in SQLite files and plain files in the user's own data folder. It has no accounts, no server of its own, no telemetry and no analytics.
- It listens only on `127.0.0.1`. It answers requests from other devices only when the user turns on tailnet access, which is off by default.
- It makes five kinds of outbound request. Three happen only when the user acts. The other two happen by default: the desktop app's update check, and remote images in notes (a known gap, not an intended exception). Nothing can turn either off today.
- Nothing is encrypted by Remry. At rest, the data relies on full-disk encryption (FileVault, BitLocker) and the OS's file permissions.

## Data at rest

### Where it lives

One data folder per user account (`dataDirFor`, `src/shared/settings/server/app-dirs.ts:31-35`):

| OS | Folder |
|---|---|
| macOS | `~/Library/Application Support/Remry/` |
| Windows | `%LOCALAPPDATA%\Remry\` (local, not roaming) |
| Linux | `$XDG_DATA_HOME/remry`, usually `~/.local/share/remry` |

Logs go to `~/Library/Logs/Remry/` on macOS, `<data folder>\Logs` on Windows and `<data folder>/logs` on Linux (`logsDirFor`, `app-dirs.ts:42-46`).

### What's in it

| Path | Format | Contents |
|---|---|---|
| `settings.json` | JSON, written with mode `0600` (`src/shared/settings/server/root-settings.server.ts:39`) | Default notebook, license key, tailnet name, chosen AI assistant CLI |
| `Notebooks/<id>/notebook.json` | JSON | The notebook's name and profile |
| `Notebooks/<id>/working-notes.db` (plus `-wal`, `-shm`) | SQLite in WAL mode (`src/shared/db/libsql.server.ts:45`) | All notebook content: people, groups, projects, goals, notes, docs, wiki pages, todos, comments, saved chats with the assistant (`page_chat`) |
| `Notebooks/<id>/files/` | The files as uploaded | Uploaded PDFs and images, editor images, branding images |
| `Backups/<id>/` | SQLite copies plus files and `manifest.json` | Snapshots (see Backups) |
| `App/current`, `App/<version>/` | A link, or executables | What every client runs: on macOS a link to `Remry.app/Contents/MacOS`, with no copy; on Windows a copy of the bundled `remry.exe` (`cli/desktop.ts`) |
| `setup.json`, `desktop.json`, `app.json`, `app-path` | JSON or text | Install and version markers |

### Encryption

Remry encrypts nothing at rest. The database, uploaded files, backups and `settings.json` are plain files. Confidentiality at rest depends on:

- full-disk encryption (FileVault, BitLocker, LUKS), which Remry neither checks for nor requires
- the OS's file permissions on the user's home folder. Remry sets `0600` on `settings.json` only, so every other file gets the OS default. On macOS `~/Library` is private to the user by default. On Linux, `~/.local/share` files are often readable by other local users under the common `022` umask (UNVERIFIED for any given distribution).

### Backups

`scripts/backup/` takes local snapshots only:

- **What:** a consistent copy of each changed notebook's database made with SQLite's `VACUUM INTO` (`scripts/backup/snapshot.ts:174`), plus its files, hard-linked when unchanged.
- **When:** hourly, from whichever Remry process is running. The MCP server and the desktop app's server check every 5 minutes (`scripts/backup/schedule.ts:16`). On macOS, `remry backup install` optionally adds a LaunchAgent, `dev.jweatherby.remry.backup` (`scripts/backup/launchd.ts:11`).
- **Where:** `Backups/<id>/` in the same data folder, on the same disk, unencrypted. They aren't sent anywhere. Time Machine or another system backup picks up the data folder like any other.
- **Retention** (`scripts/backup/retention.ts`): everything from the last 48 hours, then daily for 30 days, then weekly for 26 weeks.

### Browser storage

The web app keeps per-browser UI preferences in `localStorage`, such as collapsed sections and panel widths. The quick finder also caches the notebook's entity list, with names and titles, under `quick-finder-cache:v2:<notebook>` (`src/lib/common/QuickFinder.svelte:325`). That cache sits in the profile of whichever browser or desktop window opened the app.

### What uninstalling leaves behind

**`remry uninstall`** (`cli/desktop.ts`) removes what Remry set up outside its notebooks. Run it before removing the app: `/Applications/Remry.app/Contents/MacOS/remry uninstall` on macOS, or `"%LOCALAPPDATA%\Remry\App\current\remry.exe" uninstall` on Windows. It:

- stops the app's server
- removes the LaunchAgents
- removes the `remry` MCP server from Claude desktop and Claude Code, only where it runs this install's binary
- deletes `App/`

It prints what it did as JSON. It keeps the notebooks, backups and settings.

Removing the desktop app without it (dragging `Remry.app` to the Trash on macOS, or running the NSIS uninstaller on Windows) leaves:

- **The whole data folder:** notebooks, uploaded files, backups, `settings.json` with the license key, and on Windows the copied binaries in `App/`. This is deliberate (`docs/INSTALL.md`). The user deletes the folder by hand.
- **The logs folder.**
- **macOS LaunchAgents**, if they were turned on: `~/Library/LaunchAgents/dev.jweatherby.remry.app.plist` (start at login, `src/shared/startup/login-agent.server.ts:31`) and `dev.jweatherby.remry.backup.plist`. On macOS `App/current` is a link into the app, so once the app is in the Trash and emptied, they have nothing to run and fail to start.
- **Claude's registration of the MCP server**, if `remry connect` added it: a `remry` entry in `claude_desktop_config.json` or a user-scope `claude mcp add`. On macOS it fails to start once the app is gone; on Windows it keeps running the copy in `App/`. The Claude plugin, if installed, stays installed in Claude.
- The Windows uninstaller doesn't run `remry uninstall` (UNVERIFIED whether a Tauri NSIS uninstall hook would also run during updates, which would remove Claude's registration each time).
- **A `tailscale serve` configuration**, if tailnet access was on and not turned off inside Remry first.
- **Browser and WebView storage** (the `localStorage` above).
- Whether the Windows uninstaller offers to delete app data, and which folders it would delete: UNVERIFIED. Tauri's NSIS option keys on the bundle identifier `dev.jweatherby.remry`, not the `Remry` data folder.

## Outbound network

Remry has no telemetry, crash reporting or analytics. No dependency in `package.json` or `desktop/src-tauri/Cargo.toml` is an analytics or error-reporting SDK. The web app's Content Security Policy blocks scripts from reaching any other origin (`connect-src 'self'`, `svelte.config.js:23`). The desktop window's page has no Tauri IPC (`desktop/src-tauri/capabilities/default.json`: `"permissions": []`).

These are every outbound request in the code:

| # | What | When | What it sends | On by default | How to turn it off |
|---|---|---|---|---|---|
| 1 | Desktop app update check | At every launch of the desktop app (`desktop/src-tauri/src/main.rs:564`), and from Updates → Check for Updates… (`main.rs:549`) | An HTTPS GET for `https://github.com/remry-ai/remry/releases/latest/download/latest.json` (`desktop/src-tauri/tauri.conf.json:55`), through `tauri-plugin-updater` (`main.rs:417-418`). No notebook data. The request headers are the plugin's defaults (UNVERIFIED which). GitHub sees the IP address. If an update exists, it downloads the installer from GitHub after the user agrees. | Yes | No setting. A build without an updater public key never checks (`main.rs:406-415`). Blocking `github.com` at the network stops it. The CLI and MCP server never check. |
| 2 | Remote images in notes (known gap) | Whenever a page shows markdown that contains an image with an `https://` address, from `![](https://…)` or raw `<img>`. This covers notes, docs, wiki pages and their print pages. | A GET from the browser or desktop window to that image's host: IP address, User-Agent, and a Referer of the app's origin (`http://127.0.0.1:<port>/`) under `strict-origin-when-cross-origin` (`src/hooks.server.ts:40`). The image address itself can carry anything its author put in it. | Yes | No setting. The renderer passes the address through (`src/lib/common/MarkdownRenderer.svelte:27-28`), and the CSP allows any HTTPS image (`img-src … https:`, `svelte.config.js:21`). PDF export doesn't fetch remote images, because `connect-src 'self'` blocks its `fetch` (`src/lib/doc/export-pdf.ts:71`). |
| 3 | Excalidraw share links | Only when the user, or Claude on the user's request, makes a share link (`drawing.shareLink`) or imports one (`drawing.importLink`) | Server-side POST or GET to `https://json.excalidraw.com/api/v2/…` (`src/shared/drawing/excalidraw-backend.server.ts:29,40`), with a 20-second timeout and a 5 MB cap. The drawing is AES-GCM encrypted on this computer before upload with a fresh 128-bit key (`src/shared/drawing/excalidraw-link.ts:100,110`). The key exists only in the link's `#` fragment, which never goes to the server. | No | Don't use Share link. There is no admin setting. |
| 4 | The user's AI assistant CLI | Only when the user clicks Convert with Claude, Re-read, Chat, `/ask` or Sync now in the web app. The CLI and MCP server refuse these (`APP_ONLY`, `cli/api.ts:18-24`). | Remry makes no request itself. It runs the user's installed `claude -p` or `copilot -p` (`src/shared/assist/claude-process.server.ts:66,121`) and passes the relevant notebook content as the prompt: the open page, the search hits or the uploaded file. That CLI sends it to Anthropic or GitHub under the user's own account and terms. Sync now can also let the CLI fetch the entity's linked URLs and use the user's own connectors, read-only (`src/shared/assist/CLAUDE.md`). | No. Most of these features need Remry Pro, and none runs without a click. | Don't use them, or have no assistant CLI installed. There is no admin setting. |
| 5 | The user's Tailscale CLI | Only from the Other devices page, or `remoteAccess.set` | Remry makes no request itself. It runs `tailscale status --json`, `tailscale serve status --json`, `tailscale serve --bg --yes <port>` and `tailscale serve --https=443 off` (`src/shared/remote/tailscale.server.ts:39,56,63,94,118`). Tailscale's own traffic is Tailscale's. | No | Leave tailnet access off. |

Links the user clicks, such as Buy Remry Pro (Stripe) and Help (GitHub) in `src/shared/types/site.ts:7-8`, open in the default browser. The app doesn't fetch them. The Claude plugin's updates come from Claude Code's plugin marketplace on GitHub, which is Claude's traffic, not Remry's.

The CLI's own `fetch` calls (`cli/app-launch.ts:88,113`) only reach `127.0.0.1`.

## Inbound surface

### Local ports

| Port | What | Bound to |
|---|---|---|
| 7369 | The release server: the desktop app, and `remry app` from the binary | `127.0.0.1` only (`cli/app-ports.ts:5-7`, `cli/app-server.ts:71`) |
| 5173 | The dev server of a source clone (`bun run dev`) | `127.0.0.1` (`vite.config.ts:8`) |

There are no other listeners. The MCP server opens no port.

Every request goes through `localOnlyGuard` (`src/hooks.server.ts:22-34`, rules in `src/shared/remote/tailnet.ts:61`):

- **Host check:** a request whose `Host` isn't `127.0.0.1`, `localhost` or `[::1]` gets 403. This blocks DNS rebinding. The one exception is tailnet access, below.
- **API header:** `/api/trpc` requires `x-remry: 1` (`src/shared/trpc/config.ts:9`). Browsers can't add that header cross-site without a CORS preflight, which the server doesn't grant, so other websites can't drive the API.
- **Control endpoints** (`cli/app-server.ts:45-51`): `GET /__remry/app` returns the version. `POST /__remry/app/stop` stops the server and requires loopback plus `x-remry: 1`.
- **Headers** (`src/hooks.server.ts:36-43`): `nosniff`, `X-Frame-Options: DENY`, a referrer policy and a permissions policy. The CSP (`svelte.config.js:15-31`) runs scripts only from the app's own files, with no `unsafe-inline` and no `unsafe-eval`, so a `<script>` in imported markdown doesn't run.
- **There's no authentication.** Any process running on the computer can call the API on `127.0.0.1`, including processes of other logged-in OS users, since loopback isn't per-user. The trust boundary is the computer, not the OS account.

### The MCP server

- **Transport:** stdio only (`cli/mcp.ts:199`). Claude Desktop or Claude Code starts `remry mcp` as a child process (`plugin/.mcp.json`). No port, no network, no SDK: JSON-RPC handled in `cli/mcp-protocol.ts`.
- **What can connect:** only the process that started it, through its stdin and stdout.
- **What it can do:** 110 tools in this version, 41 marked read-only and 13 marked destructive (counted from `tools/list`). They are the app's tRPC procedures, with the same Zod validation, run in-process against the local database. Read: all content in the chosen notebook, any notebook by id, search, and files uploaded to the notebook (`link_read`). Write: create and update every entity type, delete or archive entities (`entity_delete`), uploads (file content passed in by Claude; no tool reads an arbitrary path from disk), backups (`backup_snapshot`), and starting or restarting the app.
- **Tools with effects beyond the notebook:**
  - `drawing_shareLink` uploads an encrypted drawing to excalidraw.com (outbound request 3).
  - `remoteAccess_set` can turn on tailnet access (with Remry Pro) and start at login.
  - `license_activate` and `license_remove` change the license key.
- **Not exposed:** the AI assistant features (`APP_ONLY`, `cli/api.ts:18-24`). There is no tool that deletes a notebook.

### Remote access (tailnet)

- **What it is:** the user's other devices on their own Tailscale network can open the app. The server still binds to `127.0.0.1`. The user's `tailscale serve` proxies `https://<machine>.<tailnet>.ts.net/` to it and terminates TLS with Tailscale's certificate.
- **Default:** off. It needs Remry Pro to turn on (`opensToOtherDevices`, `src/shared/remote/tailnet.ts`). Turning it off is always free. It's stored as `tailnetHost` in `settings.json`, and clearing that takes effect on the next request (`src/shared/remote/store.server.ts:18-25`).
- **How it's secured** (`src/shared/remote/tailnet.ts`):
  - Only the exact saved name is let through, and it must be a full `*.ts.net` MagicDNS name (`isTailnetHostname`, line 21).
  - A request marked `Tailscale-Funnel-Request` (from the public internet) is refused even if the user turned Funnel on (line 14). Remry itself never runs Funnel.
  - The `x-remry` header still applies to the API.
- **What it doesn't add:** authentication. Any device and user the tailnet's ACLs allow to reach this machine on port 443 has full read and write access to the notebooks. Access control is the tailnet's.

## Licensing

- **The check is offline** (`src/shared/license/verify.server.ts`). A key is `WN1.<base64url JSON payload>.<base64url Ed25519 signature>`. The app checks it against the public key compiled into the app (`src/shared/license/public-key.ts:4`), along with its dates and a revocation list of key ids that ships with each release (`src/shared/license/revoked.ts`). There's no network request at activation or at any later check.
- **What's stored:** the key string, as `licenseKey` in `settings.json` (mode `0600`). The payload in it carries the licensee's name and email, a key id, the plan and the issue and expiry dates (`verify.server.ts:15-22`).
- **When it lapses:** Pro features lock and nothing stored is touched. Turning tailnet access off stays free.

## Build and distribution

Platforms: macOS on Apple silicon and Windows x64. Each release is built by GitHub Actions from the public repository (`.github/workflows/release.yml`, `desktop.yml`).

| | macOS | Windows |
|---|---|---|
| Package | `.dmg` with `Remry.app` | NSIS `-setup.exe`, per-user install (`installMode: currentUser`, `tauri.conf.json`) |
| Code signing | Developer ID, hardened runtime | Authenticode through Azure Artifact Signing; the publisher is an individual developer, not a company. The installer, `remry-desktop.exe` and `remry.exe` are each signed. |
| Notarization | Notarized and stapled | n/a |
| Evidence | v0.16.113 build log: `spctl` "accepted, source=Notarized Developer ID", stapler "validate action worked" | v0.16.113 build log: all three binaries "Valid" |
| Entitlements | `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` (`desktop/src-tauri/Entitlements.plist`), needed by the embedded Bun runtime and its native SQLite module | n/a |

Signing depends on secrets in CI. A fork without them builds an ad hoc–signed macOS app or an unsigned Windows app (`scripts/release/CLAUDE.md`).

**Where it runs from:** the MCP server, the background server and the LaunchAgents all start `<data folder>/App/current/remry`, which `remry install` sets up at each launch (`cli/desktop.ts`, `desktop/CLAUDE.md`):

- **macOS:** `App/current` is a symlink to `Remry.app/Contents/MacOS`. What runs is the signed, notarized binary inside the installed app, at its install path, with its quarantine attribute untouched. Nothing executable is written to the data folder. The app refuses to start from a disk image or a translocated download, and asks to be moved to Applications.
- **Windows:** `App/current` is a junction to a copy in `App/<version>/`, because the installer can't replace a `remry.exe` that Claude's MCP servers keep running. The per-user NSIS installer puts the app under `%LOCALAPPDATA%` as well, so both paths are user-writable. A machine-wide installer is the fix (see the installer gap).
- **Old versions:** each install deletes the `App/<version>/` copies nothing uses: all but the current one and the one it replaced.

**Updates:** `tauri-plugin-updater` reads `latest.json` from the latest GitHub release. It installs only after the user agrees, and only an update whose minisign signature matches the public key in `tauri.conf.json:53` (`main.rs:21-26`). On Windows the update runs the installer in `passive` mode. The update signature covers the already-signed installer. The bundled binary then replaces the old server on the next launch.

**Release assets:** the installers, the updater archives and their `.sig` files, `latest.json` and the plugin zip. GitHub records a SHA-256 digest for each asset in its release API, but the release publishes no checksums file and no SBOM.

**Dependencies** (counted from the lockfiles at this version):

- JavaScript: 26 direct runtime and 24 direct development dependencies (`package.json`). The runtime tree (`npm ls --omit=dev --all`) resolves to about 566 packages. The full install, development tools included, is 801. The release build bundles the runtime set and the Bun runtime (1.3.13 in CI) into one binary.
- Rust (desktop shell): 8 direct dependencies (Tauri 2 and its plugins: dialog, opener, single-instance, deep-link, updater, process, plus `serde_json`). `Cargo.lock` holds 511 crates across all platforms.

## Where notebook content goes

- **Remry itself never sends notebook content anywhere.** Its only requests of its own are the update check, which carries no content, and Excalidraw share links, which carry a drawing encrypted with a key the server never sees, only when the user asks. Viewing a note can make the browser load an image the note links to (outbound request 2). That reveals that the note was opened, but not its text.
- **To Claude, only when Claude reads it.** Claude reaches notebook content through the MCP server or CLI, only by calling a tool. What it reads then goes to Anthropic as part of the user's Claude conversation, under the user's own agreement with Anthropic. Remry sends nothing to Anthropic itself and holds no API key.
- **To the user's AI assistant CLI, only when the user clicks an assist feature** (outbound request 4). Remry hands content to the `claude` or `copilot` CLI the user installed and signed in to. That CLI sends it to Anthropic or GitHub under the user's own terms.
