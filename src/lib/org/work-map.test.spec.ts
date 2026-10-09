import { describe, it, expect } from 'vitest';
import type { EntityOwner } from '$shared/types/owner';
import { buildWorkMap, layoutWorkMap, teamDepartments, NO_DEPARTMENT, type WorkMapInput } from './work-map';

const team = (id: string, label = id): EntityOwner => ({ type: 'GROUP', id, label, path: `/app/groups/${id}` });
const person = (id: string): EntityOwner => ({ type: 'PERSON', id, label: id, path: `/app/people/${id}` });

const input = (overrides: Partial<WorkMapInput> = {}): WorkMapInput => ({
  projects: [
    { id: 'pay', name: 'Payments', status: 'committed', owner: team('core', 'Core') },
    { id: 'auth', name: 'Auth', status: 'in-progress', owner: team('core', 'Core') },
    { id: 'check', name: 'Checkout', status: 'in-progress', owner: team('web', 'Web') },
    { id: 'misc', name: 'Misc', status: null, owner: null }
  ],
  goals: [{ id: 'conv', title: 'Conversion', status: 'AT_RISK', progress: 0.5, owner: person('ana') }],
  dependencies: {
    edges: [{ fromId: 'check', toId: 'pay' }, { fromId: 'pay', toId: 'gone' }],
    goals: [],
    goalLinks: [{ goalId: 'conv', projectId: 'check' }]
  },
  teams: [
    { id: 'core', name: 'Core', members: [{ personId: 'ana' }, { personId: 'bo' }, { personId: 'cy' }] },
    { id: 'web', name: 'Web', members: [{ personId: 'bo' }] }
  ],
  departments: [
    { id: 'eng', name: 'Engineering', members: [{ personId: 'ana' }, { personId: 'bo' }] },
    { id: 'prod', name: 'Product', members: [{ personId: 'bo' }] }
  ],
  ...overrides
});

describe('teamDepartments', () => {
  it('counts members by department, including people in none', () => {
    const [core] = input().teams;
    expect(teamDepartments(core!, input().departments)).toEqual([
      { name: 'Engineering', count: 2 },
      { name: NO_DEPARTMENT, count: 1 },
      { name: 'Product', count: 1 }
    ]);
  });
});

describe('buildWorkMap', () => {
  const map = buildWorkMap(input());

  it('orders lanes teams, then departments, then people, then unowned; busiest first', () => {
    expect(map.lanes.map((l) => l.key)).toEqual(['GROUP:core', 'GROUP:web', 'PERSON:ana', 'NONE']);
    expect(map.lanes.at(-1)?.label).toBe('No owner');
  });

  it('puts active work before planning, and gives team lanes their departments', () => {
    expect(map.lanes[0]?.items.map((i) => i.label)).toEqual(['Auth', 'Payments']);
    expect(map.lanes[0]?.departments[0]).toEqual({ name: 'Engineering', count: 2 });
    expect(map.lanes[2]?.items[0]?.detail).toBe('At risk · 50%');
  });

  it('draws dependencies and goal links only between cards on the map', () => {
    expect(map.edges).toEqual([
      { source: 'P:pay', target: 'P:check', kind: 'DEPENDS_ON' },
      { source: 'P:check', target: 'G:conv', kind: 'GOAL' }
    ]);
  });

  it('is empty without work', () => {
    expect(buildWorkMap(input({ projects: [], goals: [] }))).toEqual({ lanes: [], edges: [] });
  });
});

describe('layoutWorkMap', () => {
  it('stacks lanes without overlap and wraps cards into rows', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, status: 'in-progress', owner: team('core') }));
    const layout = layoutWorkMap(buildWorkMap(input({ projects: [...many, ...input().projects] })));
    for (let i = 1; i < layout.lanes.length; i++) {
      const prev = layout.lanes[i - 1]!;
      expect(layout.lanes[i]!.y).toBe(prev.y + prev.height);
    }
    const core = layout.items.filter((i) => i.lane === 'GROUP:core');
    expect(new Set(core.map((i) => i.y)).size).toBe(Math.ceil(core.length / layout.perRow));
    for (const item of layout.items) expect(item.x + 200).toBeLessThanOrEqual(layout.width);
    expect(layout.edges.every((e) => e.path.startsWith('M '))).toBe(true);
  });
});
