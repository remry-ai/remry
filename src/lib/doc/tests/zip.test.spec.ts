import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from '../zip';

describe('zip', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('stores entries with a central directory', () => {
    const zip = buildZip([{ path: 'a.md', data: new TextEncoder().encode('hi') }, { path: 'images/b.png', data: new Uint8Array([1, 2, 3]) }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralAt = view.getUint32(end + 16, true);
    expect(view.getUint32(centralAt, true)).toBe(0x02014b50);
    expect(new TextDecoder().decode(zip.subarray(30, 34))).toBe('a.md');
  });
});
