# Install

Remry runs on your own computer. A release contains the application itself, so Claude is
the only thing you need beforehand. Releases are built for Macs with Apple silicon, and, as a
preview, for Windows (x64) and Linux (x64).

To work on the code instead, read [DEVELOPMENT.md](DEVELOPMENT.md).

## Install the plugin

Follow the instructions for the Claude you use. All three install the same plugin, which contains
two things: a skill that teaches Claude how the notebook works, and an MCP server that lets Claude
read and write it.

**Claude Code**

```bash
claude plugin marketplace add remry-ai/remry
```

```bash
claude plugin install remry@remry
```

To update:

```bash
claude plugin marketplace update remry && claude plugin update remry@remry
```

Or turn on auto-update for the marketplace in `/plugin`. The repo is private, so Claude Code needs
git access to it; for background auto-update, use SSH.

**Cowork**

Customize → **+** → **Add marketplace from GitHub** → `remry-ai/remry`, then install
Remry. Uploading the release zip works too, as for Chat.

Start Cowork sessions **on your Mac, not in the cloud**, and keep Claude desktop open. A Cowork
session runs in a sandbox that cannot see `~/Library/Application Support`, so the plugin's tools are
the only route to your notebooks. Claude desktop runs those tools on your Mac for local sessions.

Do not attach the data folder to a session. Two programs must never open the same database at once.

**Claude desktop Chat**

Download `remry-<version>-darwin-arm64.zip` (`-windows-x64` or `-linux-x64` on those
systems) from the
[latest release](https://github.com/remry-ai/remry/releases/latest) and add it as a
plugin. Repeat with each new release — Chat takes uploads only.

**Windows (preview)**

The plugin starts its server with `sh`, which Windows doesn't have unless Git Bash is on your
PATH; Claude's plugin settings can't name a different command per system yet. The simplest way
round it is the desktop app (below): install it, then choose **Claude → Connect to Claude desktop**
or **Connect to Claude Code**. Or add the server yourself after installing the plugin, pointing at
the Windows launcher inside it:

```powershell
claude mcp add remry -- cmd /d /c "<plugin folder>\scripts\remry.cmd" mcp
```

In Claude desktop, the same goes in `claude_desktop_config.json` under `mcpServers`, as
`"command": "cmd"` with `"args": ["/d", "/c", "<plugin folder>\\scripts\\remry.cmd", "mcp"]`.
The launcher installs the app into `%LOCALAPPDATA%\Remry\App` and runs it from there.

## Coming from Wonos or Working Notes

Remry used to be called Wonos (the command was `wono`), and before that Working Notes (`wnotes`).
Your notebooks carry over:

- **Data.** The first time Remry runs, it moves your notebooks, backups and settings (your Pro
  license included) from the `Wonos` folder, or the `Working Notes` one, to the `Remry` one (`wonos`
  or `working-notes` to `remry` on Linux). Nothing is copied or deleted. If an older app still has a notebook open,
  Remry keeps using the old folder until you quit that app and restart Claude. The old folder
  keeps only older versions of the app, and a note saying where the data went; you can delete it.
- **The plugin.** The plugin and its MCP server are now `remry`. In Claude Code:

  ```bash
  claude plugin uninstall wonos@wonos
  claude plugin marketplace remove wonos
  claude plugin marketplace add remry-ai/remry
  claude plugin install remry@remry
  ```

  (For Working Notes, the old names are `working-notes@working-notes` and `working-notes`.) A clone's
  `bun run setup` does this for you. In Cowork and Chat, remove Wonos (or Working Notes) and add Remry the same way you added it. If you
  connected Claude with the desktop app's Claude menu, connect again: it replaces the old entry.
- **The command.** `wono` and `wnotes` still work from a clone for now, and `WONO_NOTEBOOK`,
  `WONO_BUN` and `WONO_HOME` (and `WNOTES_NOTEBOOK`, `WNOTES_BUN` and `WORKING_NOTES_HOME`) are
  still read, but use `remry` and `REMRY_*` from now on. A running app from an older release is
  stopped and replaced when Claude next starts Remry.
- **Hourly backups.** An old backup LaunchAgent is replaced by the new one the first time Claude
  or the app runs Remry.

## First run

The first time Claude starts the plugin, it installs the app into the `App` folder of your data
folder (see [Where your data lives](#where-your-data-lives)), and creates a notebook called
`notebook`. Your
notebooks stay in that folder across updates.

Nothing else to set up. Try it by telling Claude something like *"Dana Park joined Platform as a
senior engineer, reporting to Alice"*.

## The app

Ask Claude to "open Remry" and it will start the app and hand you the link. By hand:

```bash
"$HOME/Library/Application Support/Remry/App/current/remry" app
```

Then go to http://127.0.0.1:7369/app. The server binds to 127.0.0.1 and refuses any request that
didn't come from this machine.

## The desktop app (preview)

A desktop app for macOS, Windows and Linux opens Remry in a window of its own. It brings
the same app with it, starts it when you open the window, and leaves it running for Claude when you
close it. Its **Claude** menu connects Remry to Claude desktop or Claude Code, for when you
don't use the plugin (on Windows, for now, you need it). Each asks before changing Claude's
settings.

The installers aren't signed yet, so macOS and Windows warn before opening them. Builds are in the
**Desktop** workflow's artifacts on GitHub.

## Install it as a Mac app

The web app can be installed as a desktop app, so it gets its own Dock icon and its own window with
no browser chrome. It still runs entirely on your machine, against the same local server.

Start the app first, then:

- **Chrome or Edge:** open http://127.0.0.1:7369/app, then choose **Install Remry** — from
  the install icon at the right of the address bar, or from the ⋮ menu under **Cast, save and
  share**.
- **Safari 17 or later:** open the same address, then **File → Add to Dock**.

The installed app opens at `/app` and shares the browser's cookies, so it remembers which notebook
you were in. To remove it, open `chrome://apps`, right-click Remry and choose **Remove**;
in Safari, delete it from the Applications folder.

The window shows an error page whenever the server is not running. Start it again the usual way —
ask Claude to open Remry, or run `remry app` — and reload.

## Hourly backups

Remry snapshots every notebook that changed, once an hour, whenever Claude or the app is
open, on every system. There's nothing to set up.

On a Mac you can also add a LaunchAgent, so backups carry on while neither is running:

```bash
"$HOME/Library/Application Support/Remry/App/current/remry" backup install
```

The LaunchAgent snapshots every notebook hourly, when something changed, and keeps working across
app updates. It shares the hour with Claude and the app, so nothing is snapshotted twice. The log is `~/Library/Logs/Remry/backup.log`, and `backup
uninstall` removes it.

Snapshots live on this disk, so they don't protect against losing the disk. Time Machine does on a
Mac, and it backs up Application Support automatically; on Windows and Linux, use the system's own
backup.

## Where your data lives

`~/Library/Application Support/Remry/` on a Mac, `%LOCALAPPDATA%\Remry\` on
Windows, and `$XDG_DATA_HOME/remry` (usually `~/.local/share/remry`) on Linux:

| | |
|---|---|
| `Notebooks/<id>/working-notes.db` | the notebook's SQLite database |
| `Notebooks/<id>/files/` | uploaded PDFs and branding images |
| `Backups/<id>/` | that notebook's snapshots, kept outside its folder so they outlive it |
| `settings.json` | which notebook is the default, and your Pro license key |

## Troubleshooting

**`remry: command not found`.** The command is only on your PATH if you ran `bun run setup` from a
clone. From a release, use the full path:

```bash
"$HOME/Library/Application Support/Remry/App/current/remry" help
```

On Windows: `& "$env:LOCALAPPDATA\Remry\App\current\remry.exe" help`. On Linux:
`~/.local/share/remry/App/current/remry help`.

**The app is stuck, or shows an old version.** Run `remry app restart`. It stops the running app,
whatever version it is, and starts the current one. Claude can do the same with its `app_restart`
tool.

**Claude does not have the Remry tools.** Install the plugin, then start a *new* session. In
Cowork, the session must also be running on your Mac with Claude desktop open, because a cloud
session cannot run a local MCP server.

**You see "database is locked".** Another program has the notebook open. Close the app, and any
other `remry` process, then try again.
