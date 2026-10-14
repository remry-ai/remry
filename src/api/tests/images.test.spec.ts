import { describe, it, expect } from 'vitest';
import { refuseBlobUrls } from '../_images';

describe('refuseBlobUrls', () => {
  it('refuses an image still at a temporary blob: address', () => {
    const result = refuseBlobUrls('Before\n\n![shot.png](blob:http://127.0.0.1:7369/428e37a0-9454)\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Paste or drop it again');
  });

  it('allows stored images, files-route paths and text that only mentions blob:', () => {
    expect(refuseBlobUrls('![a](storage://pages/p1/image-1.png) ![b](/files/docs/d1/image-2.png "w=393")').ok).toBe(true);
    expect(refuseBlobUrls('A `blob:` URL lasts as long as its tab.').ok).toBe(true);
  });
});
