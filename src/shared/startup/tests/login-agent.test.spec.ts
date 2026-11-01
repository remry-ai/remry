import { describe, it, expect } from 'vitest';
import { loginUnsupportedReason, renderLoginPlist } from '../login-agent';

describe('loginUnsupportedReason', () => {
  it('offers it on a Mac with the desktop app installed', () => {
    expect(loginUnsupportedReason({ platform: 'darwin', installed: true, test: false })).toBeNull();
  });

  it('says why it is not offered', () => {
    expect(loginUnsupportedReason({ platform: 'darwin', installed: false, test: false })).toMatch(/desktop app/);
    expect(loginUnsupportedReason({ platform: 'win32', installed: true, test: false })).toMatch(/macOS/);
    expect(loginUnsupportedReason({ platform: 'darwin', installed: true, test: true })).toMatch(/tests/);
  });
});

describe('renderLoginPlist', () => {
  const plist = renderLoginPlist({ binary: '/Users/a & b/Remry/App/current/remry', workingDirectory: '/Users/a/Remry', logFile: '/Users/a/Logs/app.log' });

  it('runs the installed binary as the app server at login, escaped', () => {
    expect(plist).toContain('<string>/Users/a &amp; b/Remry/App/current/remry</string>\n    <string>app</string>');
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
  });

  it('never restarts it, so a newer version can take the port', () => {
    expect(plist).not.toContain('KeepAlive');
  });
});
