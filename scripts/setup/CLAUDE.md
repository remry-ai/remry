# Claude plugin and setup — `plugin/` and `scripts/setup/`

The repo is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with one plugin, `plugin/`. This guide sits in `scripts/setup/` because everything in `plugin/` ships to users.

- `plugin/skills/remry/`: the skill (recipes, the chart syntax in `references/charts.md`, drawings in `references/drawings.md`). It uses only MCP tools and `remry`, never repo paths.
- `plugin/scripts/remry` (`remry.cmd` on Windows): the shim `.mcp.json` runs, with `sh`, to start the MCP server. It runs, in order: the clone named by `$REMRY_HOME`; the desktop app's binary, `<data dir>/App/current/remry`; or the clone in `<data dir>/app-path`, which setup writes. The plugin carries no app.
- `plugin/.mcp.json`: starts the `remry` MCP server.

It's a subfolder because the plugin's cache copy is only these files; at the repo root the whole app would be copied, with a top-level `bin/` that claude.ai-hosted plugins (Cowork) reject.

## Setup (`main.ts`, pure `planInstall` / `planUninstall`)

`bun run setup` writes the `app-path` pointer, links `remry` into Bun's global bin, zips `plugin/` into `dist/remry.zip` (Claude desktop Chat), and installs this clone's plugin in Claude Code as **`remry-dev`** (`remry-dev@remry-dev`, tools `mcp__plugin_remry-dev_remry__*`). That's a renamed copy in `dist/dev-marketplace` whose `.mcp.json` sets `REMRY_HOME` to the clone, so a development machine runs its clone even with the desktop app installed. Re-run it after changing the skill. It keeps the `remry` marketplace registered from GitHub, which Claude desktop needs to check the released plugin for updates. `bun run setup uninstall` undoes it.

## Versions

- **Bump with `bun run release:version <x.y.z>`** whenever the plugin should update: it sets `plugin/.claude-plugin/plugin.json` and `package.json`. Claude Code and Cowork skip a version they already have, and a release fails if `plugin/` changed without a new version.
- **Only the release workflow changes `marketplace.json`:** it points the plugin at the release's `dist-v<version>` tag once the build is published (`scripts/release/advertise.ts`), so Claude desktop never sees a version before its files exist. Pull before your next push.

## Cowork

Cowork sessions run in a sandbox that can't see `~/Library/Application Support`; Claude desktop runs the MCP server on the Mac and bridges its tools in. The skill and the server instructions tell Claude never to read the data folder, run `remry` from a sandbox, or ask for the folder to be attached: a SQLite database opened from both sides isn't safe.
