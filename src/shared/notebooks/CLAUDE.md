# Notebooks and local state — `src/shared/notebooks/` and `src/shared/settings/`

Data lives like a native app's, in one data folder (`dataDirFor` in `settings/server/app-dirs.ts`, pure): `~/Library/Application Support/Remry/` on macOS, `%LOCALAPPDATA%\Remry\` on Windows, `$XDG_DATA_HOME/remry` on Linux.

```
settings.json                     defaultNotebook, licenseKey, tailnetHost, llmProvider
Notebooks/<id>/notebook.json      the notebook's name and profile
Notebooks/<id>/working-notes.db   SQLite in WAL mode, so the app, CLI and backups share it
Notebooks/<id>/files/             files uploaded as links, editor images, branding images
Backups/<id>/                     that notebook's snapshots, outside its folder so they outlive it
App/<version>/, App/current       the desktop app's installed binaries (desktop/CLAUDE.md)
app-path                          the clone `bun run setup` points the plugin at
```

- **Notebooks are separate databases,** never tenants: no table has a notebook column, and nothing reads across notebooks. There is no `notebook.delete`, on purpose: the user moves a folder out of `Notebooks/` by hand. The procedures: `src/api/CLAUDE.md` § Notebooks.
- **Which notebook** (`resolveNotebook`, `resolve.ts`, pure): the CLI and MCP use the one named on the call, then `REMRY_NOTEBOOK`, then the default; the UI uses `?notebook=<id>`, then its `wn-notebook` cookie, then the default, so switching in the browser never changes where Claude writes.
- **First run needs nothing:** `ensureLayout()` (`layout.server.ts`) runs before any database opens and makes a notebook called `notebook` in an empty folder. `ensureDatabase(notebookId)` (`src/shared/db/bootstrap.server.ts`) applies pending migrations in-process, the first time each process touches each notebook.
- **Settings** are plain TypeScript in `src/shared/settings/` (`base/` client-safe, `server/` server-only); `APP_ENV` picks `development` (default), `production` or `test`. No secrets, no `.env`. The one server setting is `dataDir`; `server/paths.ts` derives every path from it and throws on a notebook id that isn't a valid slug (`isNotebookId`), so an id can never reach outside `Notebooks/`. `settings.json` is read and written by `server/root-settings.server.ts`, keeping keys it doesn't know.
- **Dev and prod share these notebooks.** Integration tests use `./data/test` (`APP_ENV=test`) and refuse to run against anything else.
