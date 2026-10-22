import { describe, it, expect } from 'vitest';
import { kindKeyFromName } from '../kind-key';

describe('kindKeyFromName', () => {
  it('makes a key from a name', () => {
    expect(kindKeyFromName('Home item')).toBe('HOME_ITEM');
    expect(kindKeyFromName(' 2026 taxes! ')).toBe('TAXES');
  });
});
