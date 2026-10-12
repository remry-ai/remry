import { describe, it, expect } from 'vitest';
import { duplicateNameError, normalizeName, sameName } from '../_duplicates';

const rows = [
  { id: 'p1', name: 'Dana Park', archivedAt: null },
  { id: 'p2', name: 'Alice Johnson', archivedAt: new Date('2026-01-01') }
];

describe('duplicate names', () => {
  it('compares names without case or extra spaces', () => {
    expect(normalizeName('  Dana   PARK ')).toBe('dana park');
    expect(sameName(rows, 'dana park')?.id).toBe('p1');
    expect(sameName(rows, 'Dana Parker')).toBeUndefined();
  });

  it('names the existing one, whether it is archived, and both ways forward', () => {
    const message = duplicateNameError('Person', 'person.update', rows[1]!).message;
    expect(message).toBe(
      'Person "Alice Johnson" already exists (id p2, archived). Change that one with person.update --id p2, ' +
      'or pass allowDuplicate: true if this is a different person with the same name.'
    );
  });
});
