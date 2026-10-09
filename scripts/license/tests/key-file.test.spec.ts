import { describe, it, expect } from 'vitest';
import { defaultPrivateKeyPath } from '../key-file';

describe('defaultPrivateKeyPath', () => {
  it('uses ~/.remry-license, unless the key is still only in a folder from before the renames', () => {
    const at = (...paths: string[]) => (path: string): boolean => paths.includes(path);
    expect(defaultPrivateKeyPath('/home/me', at())).toBe('/home/me/.remry-license/private.pem');
    expect(defaultPrivateKeyPath('/home/me', at('/home/me/.working-notes-license/private.pem'))).toBe('/home/me/.working-notes-license/private.pem');
    expect(defaultPrivateKeyPath('/home/me', at('/home/me/.wonos-license/private.pem', '/home/me/.working-notes-license/private.pem'))).toBe('/home/me/.wonos-license/private.pem');
    expect(defaultPrivateKeyPath('/home/me', at('/home/me/.remry-license/private.pem', '/home/me/.working-notes-license/private.pem'))).toBe('/home/me/.remry-license/private.pem');
  });
});
