// Where the app listens, and the control endpoints of the release apps earlier versions
// shipped as a standalone binary. Releases no longer carry one, but a computer that ran
// one may still have it running, so cli/app-launch.ts can still identify and stop it.

export const APP_HOST = '127.0.0.1';
/** 7369 spells REMY on a phone keypad. Not 5173, Vite's default, which other dev servers take. */
export const APP_PORT = 7369;
/**
 * A clone's dev server (`bun run dev`, `remry app` from a clone): SvelteKit's usual port, so a
 * release app and a dev server can run side by side.
 */
export const DEV_PORT = 5173;
/**
 * Where release apps before 0.14.9 ran; a newer release stops one it finds there
 * (cli/app-launch.ts). It's DEV_PORT too, so only an app that reports a version goes.
 */
export const LEGACY_APP_PORTS: readonly number[] = [5173];

/** GET: a release app's version (cli/app-launch.ts). */
export const APP_CONTROL_PATH = '/__remry/app';
/** POST: stops a release app. */
export const APP_STOP_PATH = '/__remry/app/stop';
/** The same, in apps from before the renames (Wonos, then Working Notes), which a newer release still replaces. */
export const LEGACY_APP_CONTROL_PATHS: readonly string[] = ['/__wono/app', '/__wnotes/app'];
export const LEGACY_APP_STOP_PATHS: readonly string[] = ['/__wono/app/stop', '/__wnotes/app/stop'];
/** The local header those apps' stop endpoints require (ours is LOCAL_HEADER). */
export const LEGACY_LOCAL_HEADERS: readonly string[] = ['x-wono', 'x-working-notes'];
