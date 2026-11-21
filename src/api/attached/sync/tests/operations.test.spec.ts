import { describe, it, expect } from 'vitest';
import { syncDocTitle } from '../operations';
import { isStrayFileLink } from '$api/attached/link/stray-files';

describe('syncDocTitle', () => {
  it('names the sync doc for its entity, keeping it within a title\'s 200 characters', () => {
    expect(syncDocTitle('Checkout')).toBe('Checkout brief');
    const long = syncDocTitle('x'.repeat(250));
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith('… brief')).toBe(true);
  });
});

describe('isStrayFileLink', () => {
  it('is true only for a file link outside its own entity\'s folder', () => {
    expect(isStrayFileLink({ entityType: 'PROJECT', entityId: 'p1', url: 'storage://docs/d1/file-a.pdf' })).toBe(true);
    expect(isStrayFileLink({ entityType: 'PROJECT', entityId: 'p1', url: 'storage://projects/p1/file-a.pdf' })).toBe(false);
    expect(isStrayFileLink({ entityType: 'PROJECT', entityId: 'p1', url: 'https://example.com/a.pdf' })).toBe(false);
    // A note has no folder of its own, so there's nowhere to move it.
    expect(isStrayFileLink({ entityType: 'NOTE', entityId: 'n1', url: 'storage://docs/d1/file-a.pdf' })).toBe(false);
  });
});
