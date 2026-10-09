import { describe, it, expect } from 'vitest';
import { isPersonChoice, relationChoices, relationEnd, toPersonRelationInput, toRelationInput } from '../relations';

const team = { entityType: 'GROUP', entityId: 't1' } as const;
const project = { entityType: 'PROJECT', entityId: 'p1' } as const;

const PARENT = { key: 'PARENT_OF', label: 'Parent of', inverseLabel: 'Child of', symmetric: false, exclusive: false, sortOrder: 0 };
const FRIEND = { key: 'FRIEND_OF', label: 'Friend of', inverseLabel: 'Friend of', symmetric: true, exclusive: false, sortOrder: 1 };
const kinds = [PARENT, FRIEND];

describe('relationChoices', () => {
  it('offers RELATED once and DEPENDS_ON from both sides, never MENTIONS', () => {
    expect(relationChoices(kinds, 'PROJECT')).toEqual([
      { id: 'RELATED:out', name: 'Related to' },
      { id: 'DEPENDS_ON:out', name: 'Depends on' },
      { id: 'DEPENDS_ON:in', name: 'Needed by' }
    ]);
  });

  it('adds person kinds on a person: an asymmetric kind from both sides, a symmetric one once', () => {
    expect(relationChoices(kinds, 'PERSON').map((c) => c.id)).toEqual([
      'RELATED:out', 'DEPENDS_ON:out', 'DEPENDS_ON:in', 'person:PARENT_OF:out', 'person:PARENT_OF:in', 'person:FRIEND_OF:out'
    ]);
    expect(isPersonChoice('person:PARENT_OF:in')).toBe(true);
    expect(isPersonChoice('RELATED:out')).toBe(false);
  });
});

describe('toRelationInput', () => {
  it('points a forward choice from this entity to the target', () => {
    expect(toRelationInput('DEPENDS_ON:out', team, project)).toEqual({
      fromType: 'GROUP', fromId: 't1', toType: 'PROJECT', toId: 'p1', kind: 'DEPENDS_ON'
    });
  });

  it('swaps the ends for an inverse choice', () => {
    expect(toRelationInput('DEPENDS_ON:in', team, project)).toEqual({
      fromType: 'PROJECT', fromId: 'p1', toType: 'GROUP', toId: 't1', kind: 'DEPENDS_ON'
    });
  });

  it('refuses choices it cannot read', () => {
    expect(toRelationInput('MENTIONS:out', team, project)).toBeNull();
    expect(toRelationInput('uses:out', team, project)).toBeNull();
    expect(toRelationInput('RELATED:in', team, project)).toBeNull();
    expect(toRelationInput('person:PARENT_OF:out', team, project)).toBeNull();
    expect(toRelationInput('DEPENDS_ON', team, project)).toBeNull();
  });
});

describe('toPersonRelationInput', () => {
  it('reads a person choice from this person, swapping the ends for an inverse', () => {
    expect(toPersonRelationInput('person:PARENT_OF:out', 'me', 'kid', kinds)).toEqual({ fromId: 'me', toId: 'kid', kind: 'PARENT_OF' });
    expect(toPersonRelationInput('person:PARENT_OF:in', 'me', 'mom', kinds)).toEqual({ fromId: 'mom', toId: 'me', kind: 'PARENT_OF' });
  });

  it('refuses an inverse of a symmetric kind and a built-in choice', () => {
    expect(toPersonRelationInput('person:FRIEND_OF:in', 'me', 'kim', kinds)).toBeNull();
    expect(toPersonRelationInput('RELATED:out', 'me', 'kim', kinds)).toBeNull();
  });
});

describe('relationEnd', () => {
  it('accepts relatable types only', () => {
    expect(relationEnd('GROUP', 't1')).toEqual(team);
    expect(relationEnd('TODO', 'x1')).toEqual({ entityType: 'TODO', entityId: 'x1' });
    expect(relationEnd('LINK', 'l1')).toBeNull();
    expect(relationEnd('GROUP', '')).toBeNull();
  });
});
