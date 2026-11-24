import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { buildZip, crc32 } from '../../../lib/doc/zip';
import { readZip } from '../zip';

/** A one-file archive with its data deflated, as Finder or `zip` would make it. */
const deflatedZip = (path: string, data: Uint8Array): Uint8Array => {
  const stored = buildZip([{ path, data }]);
  const packed = new Uint8Array(deflateRawSync(data));
  const name = new TextEncoder().encode(path);
  const out = new Uint8Array(30 + name.length + packed.length + 46 + name.length + 22);
  const v = new DataView(out.buffer);
  out.set(stored.subarray(0, 30 + name.length));
  v.setUint16(8, 8, true);
  v.setUint32(18, packed.length, true);
  out.set(packed, 30 + name.length);
  const central = 30 + name.length + packed.length;
  out.set(stored.subarray(30 + name.length + data.length, 30 + name.length + data.length + 46 + name.length), central);
  v.setUint16(central + 10, 8, true);
  v.setUint32(central + 20, packed.length, true);
  v.setUint32(central + 16, crc32(data), true);
  const end = central + 46 + name.length;
  out.set(stored.subarray(stored.length - 22), end);
  v.setUint32(end + 12, 46 + name.length, true);
  v.setUint32(end + 16, central, true);
  return out;
};

describe('readZip', () => {
  it('reads what the export writes', () => {
    const zip = buildZip([{ path: 'A.md', data: new TextEncoder().encode('hi') }, { path: 'images/x.png', data: new Uint8Array([9, 8]) }]);
    const files = readZip(zip);
    expect(files.ok && files.value.map((f) => [f.path, [...f.bytes]])).toEqual([['A.md', [104, 105]], ['images/x.png', [9, 8]]]);
  });

  it('reads a deflated entry', () => {
    const text = 'hello '.repeat(200);
    const files = readZip(deflatedZip('a.md', new TextEncoder().encode(text)));
    expect(files.ok && new TextDecoder().decode(files.value[0]!.bytes)).toBe(text);
  });

  it('refuses what is not a zip', () => {
    const r = readZip(new TextEncoder().encode('not a zip at all, sorry'));
    expect(!r.ok && r.error.message).toContain("isn't a .zip");
  });
});
