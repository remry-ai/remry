# Remry Pro licenses — `src/shared/license/`

A yearly license unlocks the features in `PRO_FEATURES` (`src/shared/types/license.ts`). Everything else is free, search included, and nothing stored is touched when a license lapses: it all comes back with a renewed key.

## What's Pro

- **AI assist** (`ai`): the Chat tab (`chat.send`), the finder's `/ask` (`chat.ask`) and Convert with Claude (`link.convert`). Re-read (`link.transcribe`) stays free; without Pro, an upload to an empty doc or page saves the file's text instead of writing the page from it.
- **Sync docs** (`sync`): making a sync doc or page (the first `prompt` set on `doc.update` / `page.update`: `makesSyncDoc`, `startsSync`, `syncDocGated` in `src/api/_license.ts`) and `sync.now`. An existing sync doc keeps its prompt editable and clearable, and Claude can still refresh it through the tools.
- **More than 3 drawings in a notebook** (`drawings`, `FREE_DRAWINGS`, drawing docs and pages together, archived included: `countDrawings`). Only making another is locked (`drawingGated`: `page.create`, `doc.add`, a body turned into a drawing (`becomesDrawing`), `drawing.importLink` into a new one). Existing drawings stay editable; deleting one frees a place. Spreadsheets have no limit.
- **Branding** (`branding`): `branding.*` writes, the app in a branding's colours, branded PDFs. Plain PDF export is free (`printBrandingChoice` in `src/lib/doc/print-options.ts`).
- **Opening the app on other devices** (`other-devices`): `remoteAccess.set` with `tailscale: true` or a `hostname` (`opensToOtherDevices`). Turning it off and start at login are free, so a lapsed license never leaves it open with no way to close it.

Gates live in the routes (so `entity.convert`, which moves a drawing or a prompt, isn't counted). `gated(ctx, feature, run)` returns `err(lockedMessage(…))` without an active license, worded for Claude (`tool`) or the app (`app`). `ctx.license` is on the tRPC context. `tests/integration/pro-features.test.ts` checks every gate with and without a license.

In the app, `ProIcon` marks a locked control and `ProLock` stands in for a locked panel (`src/lib/CLAUDE.md`); the `/app` layout loads `license` and drops the branded theme without one.

## Keys

- **Checked offline:** `WN1.<base64url payload>.<base64url Ed25519 signature>`, payload `{ v, id, name, email, plan: 'pro', issued, expires }`, good through `expires` (UTC). `verifyLicenseKey` (`verify.server.ts`) checks it against `public-key.ts`, or a test-only key under `APP_ENV=test` (its private half is `tests/license-test-key.ts`). No network, ever.
- **One per computer:** `licenseKey` in `<data dir>/settings.json`, read on every check (`currentLicense`, `store.server.ts`), so the app, CLI and MCP server agree at once. `license.status`, `license.activate --key`, `license.remove`; the app's page is `/app/license`.
- **Issuing** (the seller, never the app): `bun run license:keygen` makes the signing keypair once (private key in `~/.remry-license/private.pem`, never committed; it rewrites `public-key.ts`; a new keypair invalidates every key). `bun run license:issue --name --email [--months 12] [--from …] [--renews <id>]` prints a key.
- **Selling** happens outside this repo: a Stripe Payment Link, and jweatherby.dev's Vercel functions sign and email a key on every `invoice.paid` (id `stripe-<subscription id>`, so renewals keep it) with the same private key. Change the key format there too. The app only links to it (`REMRY_LINKS`, `src/shared/types/site.ts`).
- **Refunds:** `bun run license:revoke --key <latest key>` (or `--id --expires`) adds the id to `revoked.ts`, which ships with each release; `verifyLicenseKey` then refuses it. Entries past their expiry are dropped on every run. Ids only, never names or emails (`scripts/license/revoke-list.ts`).
- **It's an honour system.** Don't add obfuscation, phoning home, or anything that could lock a user out of their own data.
