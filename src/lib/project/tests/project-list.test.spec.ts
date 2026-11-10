import { describe, it, expect } from 'vitest';
import { flattenTree } from '$shared/utils/hierarchy';
import {
  TEAM_NONE,
  defaultCollapseBase,
  isRowCollapsed,
  parseProjectListParams,
  projectListGroups,
  projectTeamOptions,
  compareByStart,
  type ProjectGroup,
  type ProjectListItem
} from '../project-list';
import type { EntityOwner } from '$shared/types/owner';

const owner = (type: EntityOwner['type'], id: string, label: string): EntityOwner => ({
  type,
  id,
  label,
  path: `/app/${type.toLowerCase()}s/${id}`
});

const project = (id: string, parentId: string | null, projectOwner: EntityOwner | null): ProjectListItem => ({
  id,
  name: id,
  status: null,
  parentId,
  owner: projectOwner,
  childCount: 0,
  archivedAt: null
});

const pps = owner('GROUP', 'pps', 'PPS');
const ppa = owner('GROUP', 'ppa', 'PPA');
const lcp = owner('GROUP', 'lcp', 'LCP');

// Mirrors the work notebook: an unowned parent with children in two teams, and a team parent with its own team's children.
const projects: readonly ProjectListItem[] = [
  project('exchange', null, null),
  project('exchange-pps-1', 'exchange', pps),
  project('exchange-pps-2', 'exchange', pps),
  project('exchange-ppa', 'exchange', ppa),
  project('orchestration', null, lcp),
  project('orchestration-m1', 'orchestration', lcp),
  project('solo', null, owner('PERSON', 'alice', 'Alice'))
];

const teams = projectTeamOptions(projects);
const params = (query: string) => parseProjectListParams(new URLSearchParams(query), teams);

const groupsFor = (query: string): readonly ProjectGroup[] => projectListGroups(projects, params(query), teams);
const onlyGroup = (query: string): ProjectGroup => {
  const groups = groupsFor(query);
  const [group] = groups;
  if (groups.length !== 1 || !group) throw new Error(`expected one group, got ${groups.length}`);
  return group;
};
const rows = (group: ProjectGroup | undefined) =>
  flattenTree(group?.nodes ?? []).map((n) => [n.item.id, n.depth, n.context]);

describe('projectTeamOptions', () => {
  it('lists owner teams by name, then "No group"', () => {
    expect(teams.map((t) => t.id)).toEqual(['lcp', 'ppa', 'pps', TEAM_NONE]);
  });
});

describe('parseProjectListParams', () => {
  it('reads the team and grouping', () => {
    expect(params('team=pps&group=team')).toEqual({ team: 'pps', groupBy: 'team', sort: 'name' });
  });

  it('ignores an unknown team or grouping', () => {
    expect(params('team=gone&group=colour')).toEqual({ team: null, groupBy: 'none', sort: 'name' });
  });
});

describe('projectListGroups', () => {
  it('is one group with every project when not filtered or grouped', () => {
    const group = onlyGroup('');
    expect(group.count).toBe(projects.length);
    expect(rows(group).every(([, , context]) => context === false)).toBe(true);
  });

  it('keeps a parent from another team as context when filtering', () => {
    const group = onlyGroup('team=pps');
    expect(rows(group)).toEqual([
      ['exchange', 0, true],
      ['exchange-pps-1', 1, false],
      ['exchange-pps-2', 1, false]
    ]);
    expect(group.count).toBe(2);
  });

  it('shows an unowned parent under "No group" without its team children', () => {
    expect(rows(onlyGroup(`team=${TEAM_NONE}`))).toEqual([
      ['exchange', 0, false],
      ['solo', 0, false]
    ]);
  });

  it('groups by team with "No group" last and counts that skip context rows', () => {
    const groups = groupsFor('group=team');
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['LCP', 2],
      ['PPA', 1],
      ['PPS', 2],
      ['No group', 2]
    ]);
    expect(rows(groups[1])).toEqual([
      ['exchange', 0, true],
      ['exchange-ppa', 1, false]
    ]);
  });

  it('is empty when there are no projects', () => {
    expect(projectListGroups([], params(''), [])).toEqual([]);
  });
});

describe('collapsing rows', () => {
  it('starts collapsed on the main view and expanded on team views', () => {
    expect(defaultCollapseBase(params(''))).toBe('collapsed');
    expect(defaultCollapseBase(params('team=pps'))).toBe('expanded');
    expect(defaultCollapseBase(params('group=team'))).toBe('expanded');
  });

  it('flips rows in the toggled set away from the base', () => {
    const toggled = new Set(['exchange']);
    expect(isRowCollapsed('exchange', 'collapsed', toggled)).toBe(false);
    expect(isRowCollapsed('orchestration', 'collapsed', toggled)).toBe(true);
    expect(isRowCollapsed('exchange', 'expanded', toggled)).toBe(true);
    expect(isRowCollapsed('orchestration', 'expanded', toggled)).toBe(false);
  });

  it('hides the children of collapsed rows', () => {
    const toggled = new Set(['orchestration']);
    const visible = flattenTree(onlyGroup('').nodes, (n) => isRowCollapsed(n.item.id, 'collapsed', toggled));
    expect(visible.map((n) => n.item.id)).toEqual(['solo', 'exchange', 'orchestration', 'orchestration-m1']);
  });
});

describe('sort by start date', () => {
  const dated = (id: string, parentId: string | null, startDate: string | null): ProjectListItem => ({ ...project(id, parentId, null), startDate });
  const list: readonly ProjectListItem[] = [
    dated('a-late', null, '2026-09-01'),
    dated('b-undated', null, null),
    dated('c-early-parent', null, '2026-01-15'),
    dated('c-child-late', 'c-early-parent', '2026-05-01'),
    dated('c-child-early', 'c-early-parent', '2026-02-01'),
    dated('d-early', null, '2026-03-01'),
    dated('e-late-parent', null, '2026-04-01'),
    dated('e-child', 'e-late-parent', null)
  ];
  const ids = (query: string) => {
    const opts = projectTeamOptions(list);
    const [group] = projectListGroups(list, parseProjectListParams(new URLSearchParams(query), opts), opts);
    return flattenTree(group?.nodes ?? []).map((n) => n.item.id);
  };

  it('reads ?sort=start, and anything else as by name', () => {
    expect(parseProjectListParams(new URLSearchParams('sort=start'), []).sort).toBe('start');
    expect(parseProjectListParams(new URLSearchParams('sort=colour'), []).sort).toBe('name');
  });

  it('keeps projects without sub-projects first, each set by start date, undated last', () => {
    expect(ids('sort=start')).toEqual([
      'd-early', 'a-late', 'b-undated',
      'c-early-parent', 'c-child-early', 'c-child-late',
      'e-late-parent', 'e-child'
    ]);
  });

  it('leaves the order as loaded without it', () => {
    expect(ids('')).toEqual(['a-late', 'b-undated', 'd-early', 'c-early-parent', 'c-child-late', 'c-child-early', 'e-late-parent', 'e-child']);
  });

  it('compares dates given as Date or string, then names', () => {
    expect(compareByStart({ name: 'b', startDate: new Date('2026-01-01T00:00:00Z') }, { name: 'a', startDate: '2026-01-01' })).toBeGreaterThan(0);
    expect(compareByStart({ name: 'a', startDate: null }, { name: 'b', startDate: '2026-01-01' })).toBeGreaterThan(0);
  });
});
