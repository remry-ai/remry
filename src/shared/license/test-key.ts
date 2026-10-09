// The public half of a signing key for tests only. It is trusted only under APP_ENV=test
// (src/shared/settings/server/test.ts), where data lives in ./data/test; the app and
// releases trust only the real key in src/shared/license/public-key.ts. The private half
// is in tests/license-test-key.ts, outside the app.

export const TEST_LICENSE_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAYICewI16B53qSjvRQyJAM81+OR1A0neFF61npKKoACU=\n-----END PUBLIC KEY-----\n";
