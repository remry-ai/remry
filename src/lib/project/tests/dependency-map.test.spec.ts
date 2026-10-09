import { describe, it, expect } from 'vitest';
import type { ProjectDependencies } from '$shared/types/project-dependencies';
import { buildDependencyMap, chainOf, layoutDependencyMap } from '../dependency-map';
import type { ProjectListItem } from '../project-list';

const project = (id: string, team: string | null = null, status: string | null = 'in-progress'): ProjectListItem => ({
  id,
  name: id.toUpperCase(),
  status,
  parentId: null,
  owner: team ? { type: 'GROUP', id: team, label: team, path: `/app/teams/${team}` } : null,
  childCount: 0,
  archivedAt: null
});

const deps = (
  edges: readonly [string, string][],
  goalLinks: readonly [string, string][] = []
): ProjectDependencies => ({
  // [from, to]: from depends on to.
  edges: edges.map(([fromId, toId]) => ({ fromId, toId })),
  goals: [...new Set(goalLinks.map(([g]) => g))].map((id) => ({
    id,
    title: `Goal ${id}`,
    status: 'AT_RISK' as const,
    progress: 0.4,
    path: `/app/goals/${id}`
  })),
  goalLinks: goalLinks.map(([goalId, projectId]) => ({ goalId, projectId }))
});

const columns = (map: ReturnType<typeof buildDependencyMap>) =>
  Object.fromEntries(map.nodes.map((n) => [n.key, n.column]));

describe('buildDependencyMap', () => {
  it('puts each project right of the deepest project it depends on, and goals right of theirs', () => {
    // c depends on b and a; b depends on a; g is delivered by c.
    const map = buildDependencyMap(
      [project('a'), project('b'), project('c')],
      deps([['b', 'a'], ['c', 'b'], ['c', 'a']], [['g', 'c']]),
      null
    );
    expect(columns(map)).toEqual({ 'P:a': 0, 'P:b': 1, 'P:c': 2, 'G:g': 3 });
    const early = buildDependencyMap([project('a'), project('b')], deps([['b', 'a']], [['h', 'a']]), null);
    expect(columns(early)['G:h']).toBe(1);
    expect(map.nodes.find((n) => n.key === 'G:g')?.detail).toBe('At risk · 40%');
    expect(map.nodes.find((n) => n.key === 'G:g')?.tone).toBe('warning');
  });

  it('survives a cycle and still places every project', () => {
    const map = buildDependencyMap([project('a'), project('b')], deps([['a', 'b'], ['b', 'a']]), null);
    expect(map.nodes).toHaveLength(2);
    expect(new Set(map.nodes.map((n) => n.column))).toEqual(new Set([0, 1]));
  });

  it('gives unrelated chains their own bands, largest first', () => {
    const map = buildDependencyMap(
      [project('a'), project('b'), project('c'), project('x'), project('y')],
      deps([['b', 'a'], ['c', 'b'], ['y', 'x']]),
      null
    );
    const band = Object.fromEntries(map.nodes.map((n) => [n.key, n.band]));
    expect(band['P:a']).toBe(0);
    expect(band['P:c']).toBe(0);
    expect(band['P:x']).toBe(1);
  });

  it('counts projects without links instead of drawing them', () => {
    const map = buildDependencyMap([project('a'), project('b'), project('lonely')], deps([['b', 'a']]), null);
    expect(map.nodes.map((n) => n.key).sort()).toEqual(['P:a', 'P:b']);
    expect(map.unlinked).toBe(1);
  });

  it('with a team filter, keeps linked projects from other teams as context', () => {
    const map = buildDependencyMap(
      [project('a', 'core'), project('b', 'web'), project('c', 'web'), project('d', 'core')],
      deps([['b', 'a'], ['c', 'b']], [['g', 'b'], ['h', 'a']]),
      'web'
    );
    const context = Object.fromEntries(map.nodes.map((n) => [n.key, n.context]));
    expect(context).toEqual({ 'P:a': true, 'P:b': false, 'P:c': false, 'G:g': false });
    expect(map.unlinked).toBe(0);
  });
});

describe('chainOf', () => {
  it('follows dependencies both ways, not sideways', () => {
    const map = buildDependencyMap(
      [project('a'), project('b'), project('c'), project('side')],
      deps([['b', 'a'], ['c', 'b'], ['side', 'a']]),
      null
    );
    expect([...chainOf('P:b', map.edges)].sort()).toEqual(['P:a', 'P:b', 'P:c']);
  });
});

describe('layoutDependencyMap', () => {
  const map = buildDependencyMap(
    [project('a'), project('b'), project('x'), project('y')],
    deps([['b', 'a'], ['y', 'x']]),
    null
  );

  it('places columns left to right and bands top to bottom', () => {
    const layout = layoutDependencyMap(map);
    const at = Object.fromEntries(layout.nodes.map((n) => [n.key, n]));
    expect(at['P:b']!.x).toBeGreaterThan(at['P:a']!.x);
    expect(at['P:x']!.y).toBeGreaterThan(at['P:a']!.y);
    expect(layout.edges).toHaveLength(2);
    for (const n of layout.nodes) {
      expect(n.x + 200).toBeLessThanOrEqual(layout.width);
      expect(n.y + 44).toBeLessThanOrEqual(layout.height);
    }
  });

  it('is deterministic, and empty for an empty map', () => {
    expect(layoutDependencyMap(map)).toEqual(layoutDependencyMap(map));
    const empty = layoutDependencyMap({ nodes: [], edges: [], unlinked: 0 });
    expect([empty.width, empty.height]).toEqual([0, 0]);
  });
});
