import { describe, it, expect } from 'vitest';
import { decryptScene, encryptScene, parseShareLink, shareLinkProblem, shareLinkUrl } from '../excalidraw-link';

const scene = JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ id: 'a', type: 'rectangle' }] });

describe('share links', () => {
  it('reads the id and key from a link, and builds one back', () => {
    const link = { id: 'abc_123-XYZ', key: 'gTleNQIdt1vGTjnqe9rZyA' };
    expect(parseShareLink(shareLinkUrl(link))).toEqual(link);
    expect(parseShareLink(` https://excalidraw.com/#json=${link.id},${link.key} `)).toEqual(link);
    expect(parseShareLink(`https://app.excalidraw.com/#json=${link.id},${link.key}`)).toEqual(link);
  });

  it('refuses other links, and says why', () => {
    expect(parseShareLink('https://excalidraw.com/#room=abc,def')).toBeNull();
    expect(parseShareLink('https://evil.example/#json=abc,gTleNQIdt1vGTjnqe9rZyA')).toBeNull();
    expect(parseShareLink('http://excalidraw.com/#json=abc,gTleNQIdt1vGTjnqe9rZyA')).toBeNull();
    expect(parseShareLink('https://excalidraw.com/#json=abc')).toBeNull();
    expect(parseShareLink('not a url')).toBeNull();
    expect(shareLinkProblem('https://excalidraw.com/#room=abc,def')).toMatch(/live-collaboration/);
    expect(shareLinkProblem('https://example.com')).toMatch(/#json=<id>,<key>/);
  });
});

describe('encryptScene and decryptScene', () => {
  it('round-trip a scene, with a new key each time', async () => {
    const a = await encryptScene(scene);
    const b = await encryptScene(scene);
    expect(a.key).not.toBe(b.key);
    expect(a.key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await decryptScene(a.payload, a.key)).toBe(scene);
    // The server gets no readable text.
    expect(new TextDecoder().decode(a.payload)).not.toContain('rectangle');
  });

  it('reads a link from before 2021 (zero IV, no compression)', async () => {
    const { key } = await encryptScene('{}');
    const cryptoKey = await crypto.subtle.importKey('jwk', { alg: 'A128GCM', ext: true, k: key, key_ops: ['encrypt', 'decrypt'], kty: 'oct' }, { name: 'AES-GCM', length: 128 }, false, ['encrypt']);
    const legacy = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, cryptoKey, new TextEncoder().encode(scene)));
    expect(await decryptScene(legacy, key)).toBe(scene);
  });

  it('says so when the key is wrong', async () => {
    const { payload } = await encryptScene(scene);
    const other = await encryptScene(scene);
    await expect(decryptScene(payload, other.key)).rejects.toThrow(/couldn't be decrypted/);
  });
});
