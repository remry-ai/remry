# Install

Remry runs on your own computer. The desktop app brings everything it needs, so Claude is the only
other thing to install. It's built for Macs with Apple silicon and for Windows (x64).

To work on the code instead, read [DEVELOPMENT.md](DEVELOPMENT.md).

## 1. Install the desktop app

Download the latest version:

- **Mac (Apple silicon):** [Remry-macos-arm64.dmg](https://github.com/remry-ai/remry/releases/latest/download/Remry-macos-arm64.dmg).
  Open it and drag Remry to Applications.
- **Windows:** [Remry-windows-x64-setup.exe](https://github.com/remry-ai/remry/releases/latest/download/Remry-windows-x64-setup.exe).
  It installs for you alone; no administrator rights needed.

Older versions are on the [releases page](https://github.com/remry-ai/remry/releases).

The installers aren't code-signed yet, so the first time you open Remry:

- **Mac:** macOS says it can't check the app. Open **System Settings → Privacy & Security**, and
  choose **Open Anyway** beside Remry's entry. (Or right-click Remry in Applications and choose
  **Open**.)
- **Windows:** SmartScreen says it protected your PC. Choose **More info → Run anyway**.

Open the app once. It sets Remry up in your data folder, starts it, and shows your notebook.

**Updates.** When a new version is out, the app asks whether to install it and restart. It checks
when it opens, and from **Updates → Check for Updates…**. That check is the only request Remry
makes to the internet: it asks GitHub for the latest release, and sends nothing about you or your
notebooks. Updates are signed, and the app installs only one signed by Remry's release.

## 2. Connect Claude

**With the plugin (recommended).** It brings the skill that teaches Claude how the notebook works,
as well as the tools. Its tools run the desktop app's copy of Remry, which the app keeps up to date.

- **Claude Code:**

  ```bash
  claude plugin marketplace add remry-ai/remry
  claude plugin install remry@remry
  ```

  To update: `claude plugin marketplace update remry && claude plugin update remry@remry`, or turn
  on auto-update for the marketplace in `/plugin`.
- **Cowork:** Customize → **+** → **Add marketplace from GitHub** → `remry-ai/remry`, then
  install Remry.
- **Claude desktop Chat:** download `remry-<version>.zip` from the
  [latest release](https://github.com/remry-ai/remry/releases/latest) and add it as a plugin.
  Repeat with each new release — Chat takes uploads only.

**Without the plugin, or on Windows.** The plugin starts its server with `sh`, which Windows
doesn't have unless Git Bash is on your PATH. In the desktop app, choose **Claude → Connect to
Claude desktop…** or **Connect to Claude Code…**. It asks first, then adds Remry's tools to that
Claude's settings, pointing at the app's copy of Remry. You get the tools without the skill.

Start Cowork sessions **on your computer, not in the cloud**, and keep Claude desktop open. A Cowork
session runs in a sandbox that cannot see your data folder, so the plugin's tools are the only route
to your notebooks. Claude desktop runs those tools on your computer for local sessions.

Do not attach the data folder to a session. Two programs must never open the same database at once.

## From a clone

Developers can run Remry from a clone instead, with [Bun](https://bun.sh):

```bash
git clone git@github.com:remry-ai/remry.git
cd remry
bun install
bun run setup
```

`bun run setup` records where the clone is, puts the `remry` command on your PATH, and installs the
clone's own copy of the plugin in Claude Code, as `remry-dev`, which always runs the clone. The
released plugin runs the desktop app when it's installed, and the clone otherwise.

To update, `git pull` and `bun install`. The next Claude session runs setup again when the version
changed, and restarts the app if Claude started it.

## Coming from Wonos or Working Notes

Remry used to be called Wonos (the command was `wono`), and before that Working Notes (`wnotes`).
Your notebooks carry over:

- **Data.** The first time Remry runs, it moves your notebooks, backups and settings (your Pro
  license included) from the `Wonos` folder, or the `Working Notes` one, to the `Remry` one (`wonos`
  or `working-notes` to `remry` on Linux). Nothing is copied or deleted. If an older app still has a notebook open,
  Remry keeps using the old folder until you quit that app and restart Claude. The old folder
  keeps only older versions of the app, and a note saying where the data went; you can delete it.
- **The plugin.** The plugin and its MCP server are now `remry`. A clone's `bun run setup` removes
  the old ones from Claude Code. In Cowork and Chat, remove Wonos (or Working Notes) and add Remry
  the same way you added it.
- **The command.** `wono` and `wnotes` still work from a clone for now, and `WONO_NOTEBOOK`,
  `WONO_BUN` and `WONO_HOME` (and `WNOTES_NOTEBOOK`, `WNOTES_BUN` and `WORKING_NOTES_HOME`) are
  still read, but use `remry` and `REMRY_*` from now on.
- **Hourly backups.** An old backup LaunchAgent is replaced by the new one the first time Claude
  runs Remry.

## First run

The first time Remry runs, it creates a notebook called `notebook` in your data folder (see
[Where your data lives](#where-your-data-lives)). Your notebooks stay in that folder when the app
updates, and if you uninstall it.

Nothing else to set up. Try it by telling Claude something like *"Dana Park joined Platform as a
senior engineer, reporting to Alice"*.

## The app

Open the desktop app, or ask Claude to "open Remry" and it will start the app and hand you the
link. The desktop app's server is at http://127.0.0.1:7369/app (a clone's is
http://127.0.0.1:5173/app, from `remry app`). Closing the window leaves it running for Claude. It
binds to 127.0.0.1 and refuses any request that didn't come from this machine.

## Install it as a browser app

From a clone, without the desktop app, the web app can be installed from the browser instead, so it
gets its own Dock icon and window. Start the app first, then:

- **Chrome or Edge:** open http://127.0.0.1:5173/app, then choose **Install Remry** — from
  the install icon at the right of the address bar, or from the ⋮ menu under **Cast, save and
  share**.
- **Safari 17 or later:** open the same address, then **File → Add to Dock**.

The installed app opens at `/app` and shares the browser's cookies, so it remembers which notebook
you were in. To remove it, open `chrome://apps`, right-click Remry and choose **Remove**;
in Safari, delete it from the Applications folder.

The window shows an error page whenever the server is not running. Start it again the usual way —
ask Claude to open Remry, or run `remry app` — and reload.

## Hourly backups

Remry snapshots every notebook that changed, once an hour, whenever Claude or the desktop app is
open, on every system. There's nothing to set up.

On a Mac you can also add a LaunchAgent, so backups carry on while neither is running:

```bash
"$HOME/Library/Application Support/Remry/App/current/remry" backup install
```

(From a clone, `remry backup install`.)

The LaunchAgent snapshots every notebook hourly, when something changed. It shares the hour with
Claude, so nothing is snapshotted twice. The log is `~/Library/Logs/Remry/backup.log`, and `backup
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
| `App/<version>/`, `App/current` | the desktop app's copy of Remry, which Claude's tools run |
| `app-path` | the clone the plugin runs without the desktop app, written by `bun run setup` |

## Troubleshooting

**`remry: command not found`.** With the desktop app, use its copy:
`"$HOME/Library/Application Support/Remry/App/current/remry"` on a Mac, or
`& "$env:LOCALAPPDATA\Remry\App\current\remry.exe"` on Windows. From a clone, run
`bun run setup`, or use `bin/remry` inside it.

**"Remry isn't set up on this computer".** The plugin can't find the desktop app or a clone. Open
the desktop app once, then restart Claude.

**The app is stuck, or shows an old version.** Quit and reopen the desktop app, or ask Claude to
restart it (its `app_restart` tool).

**Claude does not have the Remry tools.** Install the plugin, then start a *new* session. In
Cowork, the session must also be running on your Mac with Claude desktop open, because a cloud
session cannot run a local MCP server.

**You see "database is locked".** Another program has the notebook open. Close the app, and any
other `remry` process, then try again.
