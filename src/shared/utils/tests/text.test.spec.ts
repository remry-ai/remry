import { describe, it, expect } from 'vitest';
import { truncateMiddle } from '../text';

describe('truncateMiddle', () => {
  it('leaves short text alone', () => {
    expect(truncateMiddle('Payments', 24)).toBe('Payments');
  });

  it('keeps the start and the end', () => {
    const out = truncateMiddle('Platform Order Native to Promos', 24);
    expect(out.length).toBeLessThanOrEqual(24);
    expect(out.startsWith('Platform Order')).toBe(true);
    expect(out.endsWith('Promos')).toBe(true);
    expect(out).toContain('…');
  });
});
