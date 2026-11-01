// Start at login (macOS): a LaunchAgent that runs the desktop app's installed binary as the
// app server when the user logs in, with no window, so other devices on the tailnet can open
// Remry without anyone opening the app first. Pure.
// - It runs `<data dir>/App/current/remry app`, which every update repoints, so it keeps
//   working across updates.
// - RunAtLoad and nothing else: no KeepAlive, so a server already on the port (the desktop
//   app's) makes this one exit, and a newer version's stop isn't undone.

export const LOGIN_AGENT_LABEL = 'dev.jweatherby.remry.app';

export interface StartAtLogin {
  readonly supported: boolean;
  readonly enabled: boolean;
  /** Why it can't be turned on here, when it isn't supported. */
  readonly reason?: string;
}

export interface LoginSupportInputs {
  readonly platform: string;
  /** The desktop app's installed binary exists (App/current/remry). */
  readonly installed: boolean;
  /** APP_ENV=test: never touch the user's real LaunchAgents. */
  readonly test: boolean;
}

/** Why start at login can't be offered here, or null when it can. */
export const loginUnsupportedReason = (i: LoginSupportInputs): string | null => {
  if (i.test) return 'Not available in tests.';
  if (i.platform !== 'darwin') return 'Start at login is only on macOS for now.';
  if (!i.installed) return 'Start at login needs the Remry desktop app installed.';
  return null;
};

export interface LoginPlistOptions {
  readonly binary: string;
  readonly workingDirectory: string;
  readonly logFile: string;
}

const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const renderLoginPlist = (o: LoginPlistOptions): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LOGIN_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(o.binary)}</string>
    <string>app</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(o.workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(o.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(o.logFile)}</string>
</dict>
</plist>
`;
