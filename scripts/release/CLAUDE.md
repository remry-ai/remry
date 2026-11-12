# Releases — `scripts/release/` and `.github/workflows/`

A release is the desktop app for macOS (Apple silicon) and Windows (x64), with the `remry` binary inside, plus the plugin. `main` is where development happens.

## Releasing

Run `bun run release:version <x.y.z>`, commit and push to main. After CI passes, `release.yml` builds the desktop app (`desktop.yml`, also runnable by hand), publishes, then points `marketplace.json` on `main` at the release (`advertise.ts`, pushed as `github-actions[bot]` with `[skip ci]`; pull before your next push). `plan.ts` skips a version already released, fails if `plugin/` changed since the last release without a new version, and fails unless `marketplace.json` names one released version and its tag (`checkMarketplace` in `versions.ts`). The app's version is `package.json`'s, which `release:version` sets.

## CI

`ci.yml`: lint, check, unit and integration tests on every push and pull request, on Linux.

## Build (`desktop.yml`, each platform on its own runner; Windows doesn't block a release)

- `bun run release:build --target <t>` (`build.ts`) builds the UI, then compiles `cli/standalone.ts` and the SvelteKit server into one binary with Bun embedded, into `dist/app/` with `migrations/` and `VERSION`. Build a target on its own OS: the binary embeds the host's libsql native package, which `libsql.ts` turns into a static require (and fails the build if libsql changes that line).
- `bun run release:smoke` (`smoke.ts`): `remry install` into an empty home, the plugin shim running it with no Bun, the MCP tool list, the app's page, assets, API, guard and stop endpoint.
- Then `desktop:prepare`, `cargo test` and `desktop:build` (`.app` and `.dmg`, or the NSIS `-setup.exe`).
- `windows-paths.ts` (a unit test) fails on any tracked path Windows can't check out: a reserved device name (`con`, `aux`, `nul`, `com1`…) as any segment, or `<>:"|?*`.

## Signing

- **macOS:** with the `APPLE_*` secrets (setup in `docs/DEVELOPMENT.md`), the app is signed with the Developer ID identity and notarized and stapled; without them (a fork), signed ad hoc. The hardened runtime is on either way, with `desktop/src-tauri/Entitlements.plist` (applied to the sidecar too): Bun's JIT, and `disable-library-validation`, without which the libsql module Bun unpacks at startup is refused and the app never starts. The workflow checks the sidecar's entitlements, runs it against an empty home, and for a Developer ID build checks Gatekeeper and the stapled ticket.
- **Windows:** with the `AZURE_*` repository variables (setup in `docs/DEVELOPMENT.md`), the workflow signs in to Azure with GitHub's OIDC token (`id-token: write`; the federated credential trusts `main`) and passes Tauri a `signCommand` from a config file (Git Bash rewrites `/switches` in arguments). Tauri signs the exe, the sidecar and the installer as it builds them, before it signs the update, so the update's signature covers the signed installer. The workflow then checks the Authenticode signatures of the installer and, unpacked with 7-Zip, the binaries inside it (not `target/release`'s copies, which Tauri leaves unsigned). Without the variables, SmartScreen warns.
- **Updates:** with `TAURI_SIGNING_PRIVATE_KEY`, each build also makes a signed update, and the release writes `latest.json` (`updater-manifest.ts`). `bun run desktop:updater-key` makes the keypair once: the private key in `~/.remry-updater/updater.key` (never commit it; set the secret from the file with `gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.remry-updater/updater.key`), the public key into `tauri.conf.json`. A new keypair strands every installed app.

## Publish

Force-pushes `plugin/` to the root of the `dist` branch (Cowork needs `.claude-plugin/plugin.json` at the root), tagging it `dist-v<version>` in the same push, then creates release `v<version>` with the installers (versioned and unversioned names; the README links `releases/latest/download/`), the signed updates, `latest.json` and the plugin zipped. `marketplace.json` points the plugin at the tag, so Claude Code, Cowork and setup all install the released plugin. The repo is public, so nothing needs credentials to download.
