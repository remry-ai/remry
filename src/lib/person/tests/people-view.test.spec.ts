import { describe, it, expect } from 'vitest';
import { defaultPeopleFocus, parsePeopleView } from '../people-view';

describe('parsePeopleView', () => {
  it('opens a home notebook on the graph and a work notebook on the table', () => {
    expect(parsePeopleView(null, 'home')).toBe('graph');
    expect(parsePeopleView(null, 'work')).toBe('table');
  });

  it('keeps an asked-for view and ignores an unknown one', () => {
    expect(parsePeopleView('table', 'home')).toBe('table');
    expect(parsePeopleView('graph', 'work')).toBe('graph');
    expect(parsePeopleView('map', 'home')).toBe('graph');
  });
});

describe('defaultPeopleFocus', () => {
  it('centres on me, else the first person, else nobody', () => {
    expect(defaultPeopleFocus([{ id: 'a', isMe: false }, { id: 'b', isMe: true }])).toBe('b');
    expect(defaultPeopleFocus([{ id: 'a', isMe: false }])).toBe('a');
    expect(defaultPeopleFocus([])).toBeNull();
  });
});
