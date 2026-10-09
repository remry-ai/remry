// The projects dependency map: projects flow left to right, each one to the
// right of the projects it depends on, and each goal just right of the
// projects that deliver it. Unrelated chains get their own horizontal band. Pure.

import type { GoalStatus } from '$shared/types/enums';
import type { ProjectDependencies } from '$shared/types/project-dependencies';
import { entityPath } from '$shared/utils/entity';
import { GOAL_STATUS_LABELS, progressTone } from '$lib/goal/utils';
import { projectTeamKey, type ProjectListItem } from './project-list';

export type MapTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';

export interface MapNode {
  /** `P:<id>` or `G:<id>`. */
  readonly key: string;
  readonly kind: 'PROJECT' | 'GOAL';
  readonly id: string;
  readonly label: string;
  /** The second line: a project's status, or a goal's status and progress. */
  readonly detail: string;
  readonly tone: MapTone;
  readonly href: string;
  /** Outside the team filter, shown because a team project links to it. */
  readonly context: boolean;
  readonly column: number;
  /** Row within its band and column. */
  readonly row: number;
  readonly band: number;
}

export interface MapEdge {
  /** Upstream: the project depended on, or the project delivering a goal. */
  readonly source: string;
  readonly target: string;
  readonly kind: 'DEPENDS_ON' | 'GOAL';
}

export interface DependencyMap {
  readonly nodes: readonly MapNode[];
  readonly edges: readonly MapEdge[];
  /** Listed projects (in the team, with a filter) that have no links. */
  readonly unlinked: number;
}

const projectKey = (id: string): string => `P:${id}`;
const goalKey = (id: string): string => `G:${id}`;

/** A project card's tone on the maps: the badge colours where the maps have them, done and abandoned muted. */
export const projectTone = (status: string | null): MapTone =>
  status === 'committed' ? 'accent' : status === 'in-progress' ? 'success' : status === 'blocked' ? 'danger' : 'muted';

/** A goal card's second line: its status, and progress when it's measured. */
export const goalDetail = (goal: { readonly status: GoalStatus; readonly progress: number | null }): string =>
  goal.progress === null
    ? GOAL_STATUS_LABELS[goal.status]
    : `${GOAL_STATUS_LABELS[goal.status]} · ${Math.round(goal.progress * 100)}%`;

export const goalTone = (status: GoalStatus): MapTone => (status === 'DROPPED' ? 'muted' : progressTone(status));

interface Draft {
  readonly key: string;
  readonly kind: 'PROJECT' | 'GOAL';
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: MapTone;
  readonly href: string;
  readonly context: boolean;
}

/**
 * Columns by longest upstream path: a project sits one column right of the
 * deepest project it depends on. A dependency that would close a cycle is
 * ignored, so every project gets a column. A goal sits one column right of the
 * deepest project delivering it, so its link never crosses unrelated cards.
 */
const assignColumns = (drafts: readonly Draft[], edges: readonly MapEdge[]): Map<string, number> => {
  const upstream = new Map<string, string[]>();
  for (const e of edges) upstream.set(e.target, [...(upstream.get(e.target) ?? []), e.source]);
  const column = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (key: string): number => {
    const known = column.get(key);
    if (known !== undefined) return known;
    visiting.add(key);
    let col = 0;
    for (const up of upstream.get(key) ?? []) {
      if (!visiting.has(up)) col = Math.max(col, visit(up) + 1);
    }
    visiting.delete(key);
    column.set(key, col);
    return col;
  };
  const projects = drafts.filter((d) => d.kind === 'PROJECT').sort((a, b) => a.label.localeCompare(b.label));
  for (const d of projects) visit(d.key);
  for (const d of drafts) {
    if (d.kind !== 'GOAL') continue;
    const delivering = (upstream.get(d.key) ?? []).map((k) => column.get(k) ?? 0);
    column.set(d.key, Math.max(-1, ...delivering) + 1);
  }
  return column;
};

/** Connected groups, largest first; ties by the first label, so the order is stable. */
const assignBands = (drafts: readonly Draft[], edges: readonly MapEdge[]): Map<string, number> => {
  const neighbours = new Map<string, string[]>(drafts.map((d) => [d.key, []]));
  for (const e of edges) {
    neighbours.get(e.source)?.push(e.target);
    neighbours.get(e.target)?.push(e.source);
  }
  const labelOf = new Map(drafts.map((d) => [d.key, d.label]));
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const d of [...drafts].sort((a, b) => a.label.localeCompare(b.label))) {
    if (seen.has(d.key)) continue;
    const group: string[] = [];
    const queue = [d.key];
    seen.add(d.key);
    while (queue.length > 0) {
      const key = queue.shift()!;
      group.push(key);
      for (const next of neighbours.get(key) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    groups.push(group);
  }
  const firstLabel = (g: readonly string[]): string =>
    g.map((k) => labelOf.get(k) ?? '').sort((a, b) => a.localeCompare(b))[0] ?? '';
  groups.sort((a, b) => b.length - a.length || firstLabel(a).localeCompare(firstLabel(b)));
  return new Map(groups.flatMap((g, band) => g.map((key) => [key, band] as const)));
};

/**
 * Rows within each band and column. The first column goes by name; later ones
 * by the average row of their upstream neighbours, so edges cross less.
 */
const assignRows = (
  drafts: readonly Draft[],
  edges: readonly MapEdge[],
  column: ReadonlyMap<string, number>,
  band: ReadonlyMap<string, number>
): Map<string, number> => {
  const upstream = new Map<string, string[]>();
  for (const e of edges) upstream.set(e.target, [...(upstream.get(e.target) ?? []), e.source]);
  const row = new Map<string, number>();
  const cells = new Map<string, Draft[]>();
  for (const d of drafts) {
    const cell = `${band.get(d.key)}:${column.get(d.key)}`;
    cells.set(cell, [...(cells.get(cell) ?? []), d]);
  }
  const byColumn = [...cells.entries()].sort(
    ([a], [b]) => Number(a.split(':')[1]) - Number(b.split(':')[1]) || Number(a.split(':')[0]) - Number(b.split(':')[0])
  );
  for (const [, members] of byColumn) {
    const weight = (d: Draft): number => {
      const rows = (upstream.get(d.key) ?? []).map((k) => row.get(k)).filter((r): r is number => r !== undefined);
      return rows.length > 0 ? rows.reduce((a, b) => a + b, 0) / rows.length : Number.POSITIVE_INFINITY;
    };
    [...members]
      .sort((a, b) => weight(a) - weight(b) || a.label.localeCompare(b.label))
      .forEach((d, i) => row.set(d.key, i));
  }
  return row;
};

/**
 * The map for the listed projects. With a team filter, the team's linked
 * projects are the map, the projects they link to come along as context, and
 * only goals the team's projects deliver are shown.
 */
export const buildDependencyMap = (
  projects: readonly ProjectListItem[],
  deps: ProjectDependencies,
  team: string | null
): DependencyMap => {
  const listed = new Map(projects.map((p) => [p.id, p]));
  const goals = new Map(deps.goals.map((g) => [g.id, g]));
  const inScope = (id: string): boolean => {
    const project = listed.get(id);
    return project !== undefined && (team === null || projectTeamKey(project) === team);
  };

  const seenEdges = new Set<string>();
  const edges: MapEdge[] = [];
  const addEdge = (edge: MapEdge) => {
    const id = `${edge.source}>${edge.target}`;
    if (edge.source === edge.target || seenEdges.has(id)) return;
    seenEdges.add(id);
    edges.push(edge);
  };
  for (const e of deps.edges) {
    if (listed.has(e.fromId) && listed.has(e.toId) && (inScope(e.fromId) || inScope(e.toId))) {
      addEdge({ source: projectKey(e.toId), target: projectKey(e.fromId), kind: 'DEPENDS_ON' });
    }
  }
  for (const l of deps.goalLinks) {
    if (inScope(l.projectId) && goals.has(l.goalId)) {
      addEdge({ source: projectKey(l.projectId), target: goalKey(l.goalId), kind: 'GOAL' });
    }
  }

  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  const drafts: Draft[] = [
    ...projects
      .filter((p) => linked.has(projectKey(p.id)))
      .map((p) => ({
        key: projectKey(p.id),
        kind: 'PROJECT' as const,
        id: p.id,
        label: p.name,
        detail: p.status ?? 'No status',
        tone: projectTone(p.status),
        href: entityPath('PROJECT', p.id),
        context: !inScope(p.id)
      })),
    ...deps.goals
      .filter((g) => linked.has(goalKey(g.id)))
      .map((g) => ({
        key: goalKey(g.id),
        kind: 'GOAL' as const,
        id: g.id,
        label: g.title,
        detail: goalDetail(g),
        tone: goalTone(g.status),
        href: g.path,
        context: false
      }))
  ];

  const column = assignColumns(drafts, edges);
  const band = assignBands(drafts, edges);
  const row = assignRows(drafts, edges, column, band);
  const nodes = drafts.map((d) => ({
    ...d,
    column: column.get(d.key) ?? 0,
    row: row.get(d.key) ?? 0,
    band: band.get(d.key) ?? 0
  }));
  const unlinked = projects.filter((p) => inScope(p.id) && !linked.has(projectKey(p.id))).length;
  return { nodes, edges, unlinked };
};

interface Link {
  readonly source: string;
  readonly target: string;
}

/** Everything upstream of `key` and everything downstream of it, and `key` itself. */
export const chainOf = (key: string, edges: readonly Link[]): ReadonlySet<string> => {
  const walk = (from: (e: Link) => string, to: (e: Link) => string): Set<string> => {
    const found = new Set<string>([key]);
    const queue = [key];
    while (queue.length > 0) {
      const at = queue.shift()!;
      for (const e of edges) {
        if (from(e) === at && !found.has(to(e))) {
          found.add(to(e));
          queue.push(to(e));
        }
      }
    }
    return found;
  };
  return new Set([...walk((e) => e.source, (e) => e.target), ...walk((e) => e.target, (e) => e.source)]);
};

// ----- Pixel layout -----

export interface MapSizes {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly bandGap: number;
  readonly pad: number;
}

export const DEFAULT_SIZES: MapSizes = {
  nodeWidth: 200,
  nodeHeight: 44,
  columnGap: 72,
  rowGap: 14,
  bandGap: 36,
  pad: 20
};

export interface PlacedNode extends MapNode {
  readonly x: number;
  readonly y: number;
}

export interface PlacedEdge extends MapEdge {
  /** An SVG path from the source's right edge to the target's left edge. */
  readonly path: string;
}

export interface MapLayout {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  readonly width: number;
  readonly height: number;
}

export const layoutDependencyMap = (map: DependencyMap, sizes: MapSizes = DEFAULT_SIZES): MapLayout => {
  const { nodeWidth, nodeHeight, columnGap, rowGap, bandGap, pad } = sizes;
  const bands = Math.max(0, ...map.nodes.map((n) => n.band + 1));
  const rowsInBand = Array.from({ length: bands }, (_, b) =>
    Math.max(0, ...map.nodes.filter((n) => n.band === b).map((n) => n.row + 1))
  );
  const bandTop: number[] = [];
  let y = pad;
  for (const rows of rowsInBand) {
    bandTop.push(y);
    y += rows * (nodeHeight + rowGap) - rowGap + bandGap;
  }
  const columns = Math.max(0, ...map.nodes.map((n) => n.column + 1));

  const nodes = map.nodes.map((n) => ({
    ...n,
    x: pad + n.column * (nodeWidth + columnGap),
    y: (bandTop[n.band] ?? pad) + n.row * (nodeHeight + rowGap)
  }));
  const at = new Map(nodes.map((n) => [n.key, n]));
  const edges = map.edges.flatMap((e) => {
    const a = at.get(e.source);
    const b = at.get(e.target);
    if (!a || !b) return [];
    const x1 = a.x + nodeWidth;
    const y1 = a.y + nodeHeight / 2;
    const x2 = b.x;
    const y2 = b.y + nodeHeight / 2;
    const bend = Math.max(32, (x2 - x1) / 2);
    return [{ ...e, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }];
  });

  return {
    nodes,
    edges,
    width: columns > 0 ? pad * 2 + columns * nodeWidth + (columns - 1) * columnGap : 0,
    height: bands > 0 ? y - bandGap + pad : 0
  };
};
