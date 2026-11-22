# Desktop app — `desktop/`

A Tauri 2 shell: a window on the local server, the installer, the updater, and the way Windows users connect Claude (the plugin's `sh` shim doesn't run there).

## A thin shell

- The executable is `remry-desktop`, never `remry`: the `remry` sidecar sits beside it (`Contents/MacOS`, or the install folder), and the names must not clash (a Rust test and the workflow's macOS check guard it).
- `src-tauri/src/main.rs` only runs the bundled `remry` sidecar (placed by `bun run desktop:prepare` as `binaries/remry-<rust triple>`, with `migrations/` and `VERSION` as resources) and the updater. The logic is TypeScript, in `cli/desktop.ts` (pure parts in `cli/desktop-plan.ts`):
  - `remry install` copies the running binary, migrations and VERSION into `<data dir>/App/<version>` and points `App/current` at it (a symlink, or a junction on Windows), writing the bytes on macOS so the copy has no quarantine flag. Every client runs `App/current`, so an update never replaces a running binary. With `REMRY_DESKTOP=1` it records the app in `<data dir>/desktop.json`.
  - `remry app ensure` starts the server or reuses it (an older one is replaced) and prints its address.
  - `remry connect claude-desktop|claude-code` registers `App/current/remry mcp` as the `remry` MCP server: in `claude_desktop_config.json` (keeping everything else, refusing a file it can't parse, keeping a `.bak`), or with `claude mcp add --scope user`.
- The server keeps running when the window closes.

## The window

It opens `ui/index.html` ("Starting…", or the error), then `http://127.0.0.1:7369/app`. The page gets no Tauri IPC (`capabilities/default.json` grants nothing), so it's the same web app a browser shows, behind the same `src/hooks.server.ts` boundary. Any other address opens in the default browser (`is_app_url`). The drag-drop handler is off, so files dragged in reach the page.

What WebKit drops without a handler (`app_window` builds every window with them; each check is tested with `cargo test`):

- **New windows:** a `target="_blank"` link or `window.open` to an app page gets a window of its own (`open_window`); anything else opens in the browser. tauri-plugin-opener's click script is off: it swallowed plain clicks on those links.
- **Downloads:** `on_download` accepts only the app's own (`is_app_download`, including a `blob:` it made, as Download PDF does), saves to Downloads and shows the file.
- **Find:** WebKit has no find bar, so the web app draws its own (`src/lib/common/FindBar.svelte`) where `window.__remryDesktop` is set (the shell's one init script, a flag, no IPC).
- **Printing:** `window.print()` needs IPC on macOS, so "Print…" navigates to `remry-print:page`, and `on_navigation` cancels that and prints (`is_print_request`).

## Links open in the window

Claude's links are app pages with `open=app` (`inAppLink`, `src/shared/desktop/handoff.ts`). `reroute` in `src/hooks.ts` sends them to the `open/[...path]` route, which keeps only `/app` paths and, on a release server with the desktop app recorded, hands the page to the window as `remry://open/app/...` (`handoff.server.ts`; `open` on macOS, `rundll32` on Windows), showing "Opened in Remry"; otherwise it redirects. The shell registers `remry://` (tauri-plugin-deep-link, single-instance) and moves its window there (`deep_link_path`, `/app` paths only). The hand-off happens only on loopback.

## Menus

Claude → "Connect to Claude desktop…" / "Connect to Claude Code…" (each asks first, and says to skip it when the plugin is installed). Updates → "Check for Updates…". File → "New Window" (⌘N). View → "Reload" (⌘R). Reload, a `remry://` link and a second launch act on the front window (`front_window`).

## Updates

The shell fetches `latest.json` from the latest GitHub release at launch (quietly) and from "Check for Updates…", and installs only after the user agrees and only an update signed with the key in `tauri.conf.json`. It sends nothing but that request. A build without an updater public key never checks. The next launch's `remry install` and `app ensure` put the new binary in place. Signing and the keypair: `scripts/release/CLAUDE.md`.

## Commands

`bun run desktop:prepare` (the binary as the sidecar), `desktop:dev` / `desktop:build` (`tauri dev` / `tauri build`, after `release:build`). Icons in `src-tauri/icons` are made from `static/icons/icon.svg` with `bunx tauri icon` (keep only the files `tauri.conf.json` lists).
