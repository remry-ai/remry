# Backups — `scripts/backup/`

`bun run backup` (or `remry backup`) snapshots each notebook whose data changed into `Backups/<notebook id>/`: a consistent `VACUUM INTO` copy of its database, its files (unchanged ones hard-linked from the previous snapshot), and a `manifest.json` naming the notebook. `--notebook <id>` works on one, with `run`, `list` or `restore`.

- **Hourly, wherever Remry runs** (`schedule.ts`): the MCP server and the desktop app's server each check every 5 minutes and snapshot changed notebooks once an hour. A lock file (`Backups/.lock`, taken over after 15 minutes) lets one process do it, and `Backups/.last-run` makes the others skip the hour. A manual run takes the lock too, and says so when another process holds it.
- `bun run backup install` (macOS, `launchd.ts`) adds an hourly LaunchAgent, `dev.jweatherby.remry.backup`, for backups while nothing else runs, sharing the same hour and lock; `uninstall` removes it. From the release binary it runs `App/current/remry backup`, so it survives updates. Log: `~/Library/Logs/Remry/backup.log`.
- `bun run backup --force --reason "<why>"` snapshots regardless. Do it before bulk or destructive changes.
- `bun run backup list` shows snapshots with counts, per notebook.
- `bun run backup restore <id|latest> --notebook <id>` (`restore.ts`) refuses while the app runs (7369 or 5173, `port.ts`), checks the snapshot's integrity, snapshots the current data first, then restores and migrates forward. `--notebook` may be left out only when there's one notebook.
- **Retention** (`retention.ts`), per notebook: everything from the last 48 hours, then one a day for 30 days, then one a week for 26 weeks, and always the 3 newest.
- Snapshots stay on the same disk, so they don't protect against disk failure; Time Machine does, and it backs up Application Support.
