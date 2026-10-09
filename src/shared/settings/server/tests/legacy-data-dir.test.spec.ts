import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { legacyDataDirsFor } from '../app-dirs';
import { EARLIER_MOVED_NOTES, MOVED_NOTE, moveLegacyDataDir, planLegacyMove } from '../legacy-data-dir';

describe('legacyDataDirsFor', () => {
  const dirs = (host: Parameters<typeof legacyDataDirsFor>[0]): readonly string[] => legacyDataDirsFor(host).map((d) => d.dir);

  it('names the folders from before each rename, newest first', () => {
    expect(dirs({ platform: 'darwin', home: '/Users/me', env: {} })).toEqual([
      '/Users/me/Library/Application Support/Wonos',
      '/Users/me/Library/Application Support/Working Notes'
    ]);
    expect(dirs({ platform: 'win32', home: 'C:\\Users\\me', env: { LOCALAPPDATA: 'D:\\Local' } })).toEqual(['D:\\Local\\Wonos', 'D:\\Local\\Working Notes']);
    expect(dirs({ platform: 'linux', home: '/home/me', env: {} })).toEqual(['/home/me/.local/share/wonos', '/home/me/.local/share/working-notes']);
    expect(legacyDataDirsFor({ platform: 'linux', home: '/home/me', env: {} }).map((d) => d.name)).toEqual(['Wonos', 'Working Notes']);
  });
});

describe('planLegacyMove', () => {
  it('moves notebooks first, then everything else but old app versions', () => {
    expect(planLegacyMove(['settings.json', 'App', 'Backups', 'Notebooks', 'app-path'], [])).toEqual(['Notebooks', 'Backups', 'app-path', 'settings.json']);
  });

  it('leaves alone what the new folder already has, such as the App/ the plugin just installed', () => {
    expect(planLegacyMove(['Notebooks', 'App', 'settings.json'], ['App'])).toEqual(['Notebooks', 'settings.json']);
  });

  it('does nothing once the new folder has notebooks, or when the old one has none', () => {
    expect(planLegacyMove(['Notebooks', 'settings.json'], ['Notebooks'])).toEqual([]);
    expect(planLegacyMove(['App', MOVED_NOTE], [])).toEqual([]);
  });

  it("leaves an earlier rename's note behind", () => {
    expect(planLegacyMove(['Notebooks', ...EARLIER_MOVED_NOTES], [])).toEqual(['Notebooks']);
    expect(planLegacyMove([], [])).toEqual([]);
  });
});

describe('moveLegacyDataDir', () => {
  const setup = (): { legacy: string; current: string } => {
    const root = mkdtempSync(join(tmpdir(), 'remry-move-'));
    const legacy = join(root, 'Wonos');
    mkdirSync(join(legacy, 'Notebooks', 'work'), { recursive: true });
    mkdirSync(join(legacy, 'App', '0.10.2'), { recursive: true });
    writeFileSync(join(legacy, 'Notebooks', 'work', 'notebook.json'), '{}');
    writeFileSync(join(legacy, 'settings.json'), '{"defaultNotebook":"work"}');
    return { legacy, current: join(root, 'Remry') };
  };

  it('moves the data, keeps old app versions behind, and leaves a note', () => {
    const { legacy, current } = setup();
    expect(moveLegacyDataDir(legacy, current, 'Wonos')).toBe(current);
    expect(existsSync(join(current, 'Notebooks', 'work', 'notebook.json'))).toBe(true);
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toContain('work');
    expect(existsSync(join(legacy, 'App', '0.10.2'))).toBe(true);
    expect(existsSync(join(legacy, 'Notebooks'))).toBe(false);
    expect(readFileSync(join(legacy, MOVED_NOTE), 'utf8')).toContain(current);
    expect(readFileSync(join(legacy, MOVED_NOTE), 'utf8')).toContain('Wonos is now Remry');
  });

  it('is a no-op the second time', () => {
    const { legacy, current } = setup();
    moveLegacyDataDir(legacy, current, 'Wonos');
    expect(moveLegacyDataDir(legacy, current, 'Wonos')).toBe(current);
  });

  it('uses the new folder when there is nothing to move', () => {
    const root = mkdtempSync(join(tmpdir(), 'remry-move-'));
    expect(moveLegacyDataDir(join(root, 'missing'), join(root, 'Remry'), 'Wonos')).toBe(join(root, 'Remry'));
  });
});
