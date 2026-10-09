// The projects list page: filter and grouping by owning group (`?team=`, kept
// from when only teams owned work), and collapsed rows.
import { buildTree, scopeTree, type ScopedNode, type TreeNode } from '$shared/utils/hierarchy';
import type { EntityOwner } from '$shared/types/owner';

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly status: string | null;
  readonly parentId: string | null;
  readonly owner: EntityOwner | null;
  readonly childCount: number;
  readonly archivedAt: Date | string | null;
  /** When it runs (`endDate` is the target) and its three-point estimate in days. */
  readonly startDate?: Date | string | null;
  readonly endDate?: Date | string | null;
  readonly daysOptimistic?: number | null;
  readonly daysLikely?: number | null;
  readonly daysPessimistic?: number | null;
}

/** The `?team=` value for projects that no team owns. */
export const TEAM_NONE = 'none';

export const PROJECT_GROUPINGS = ['none', 'team'] as const;
export type ProjectGrouping = (typeof PROJECT_GROUPINGS)[number];

export interface ProjectTeamOption {
  readonly id: string;
  readonly name: string;
  readonly path: string | null;
}

export interface ProjectListParams {
  /** A team id, `TEAM_NONE`, or null for every team. */
  readonly team: string | null;
  readonly groupBy: ProjectGrouping;
}

export interface ProjectGroup {
  readonly key: string;
  readonly label: string;
  readonly path: string | null;
  readonly nodes: readonly ScopedNode<ProjectListItem>[];
  /** Projects that belong to the group, not counting context rows. */
  readonly count: number;
}

export type CollapseBase = 'collapsed' | 'expanded';

/** A project's group is the group that owns it. Person-owned and unowned projects have none. */
export const projectTeamKey = (project: Pick<ProjectListItem, 'owner'>): string =>
  project.owner?.type === 'GROUP' ? project.owner.id : TEAM_NONE;

/** The teams that own at least one of the projects, by name, then "No team" if any project has none. */
export const projectTeamOptions = (projects: readonly ProjectListItem[]): readonly ProjectTeamOption[] => {
  const teams = new Map<string, ProjectTeamOption>();
  for (const { owner } of projects) {
    if (owner?.type === 'GROUP' && !teams.has(owner.id)) {
      teams.set(owner.id, { id: owner.id, name: owner.label ?? 'Unknown group', path: owner.path });
    }
  }
  const sorted = [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  const hasNone = projects.some((project) => projectTeamKey(project) === TEAM_NONE);
  return hasNone ? [...sorted, { id: TEAM_NONE, name: 'No group', path: null }] : sorted;
};

/** Reads `?team=` and `?group=`. A team that owns none of the listed projects means every team. */
export const parseProjectListParams = (
  searchParams: URLSearchParams,
  teams: readonly ProjectTeamOption[]
): ProjectListParams => {
  const team = searchParams.get('team');
  const group = searchParams.get('group');
  return {
    team: team !== null && teams.some((option) => option.id === team) ? team : null,
    groupBy: (PROJECT_GROUPINGS as readonly string[]).includes(group ?? '') ? (group as ProjectGrouping) : 'none'
  };
};

const countMatches = (nodes: readonly ScopedNode<ProjectListItem>[]): number =>
  nodes.reduce((total, node) => total + (node.context ? 0 : 1) + countMatches(node.children), 0);

const teamGroup = (forest: readonly TreeNode<ProjectListItem>[], team: ProjectTeamOption): ProjectGroup => {
  const nodes = parentsFirst(scopeTree(forest, (project) => projectTeamKey(project) === team.id));
  return { key: team.id, label: team.name, path: team.path, nodes, count: countMatches(nodes) };
};

/** Like a file browser: at each level, projects with sub-projects come before those without, each set keeping its order. */
export const parentsFirst = <T>(nodes: readonly ScopedNode<T>[]): readonly ScopedNode<T>[] => {
  const sorted = nodes.map((node) => ({ ...node, children: parentsFirst(node.children) }));
  return [...sorted.filter((node) => node.children.length > 0), ...sorted.filter((node) => node.children.length === 0)];
};

/**
 * The tables to render. One group for the whole list or a single team; with
 * grouping, one per team. A parent from another team stays as a context row.
 */
export const projectListGroups = (
  projects: readonly ProjectListItem[],
  params: ProjectListParams,
  teams: readonly ProjectTeamOption[]
): readonly ProjectGroup[] => {
  const forest = buildTree(projects, (project) => project.parentId);
  if (params.team !== null) {
    const team = teams.find((option) => option.id === params.team);
    return team ? [teamGroup(forest, team)] : [];
  }
  if (params.groupBy === 'team') return teams.map((team) => teamGroup(forest, team));
  const nodes = parentsFirst(scopeTree(forest, () => true));
  return nodes.length > 0 ? [{ key: 'all', label: 'All projects', path: null, nodes, count: projects.length }] : [];
};

/** The main view starts with sub-projects hidden; team views start expanded so context rows make sense. */
export const defaultCollapseBase = (params: ProjectListParams): CollapseBase =>
  params.team === null && params.groupBy === 'none' ? 'collapsed' : 'expanded';

/** `toggled` holds the rows flipped away from `base`. */
export const isRowCollapsed = (id: string, base: CollapseBase, toggled: ReadonlySet<string>): boolean =>
  (base === 'collapsed') !== toggled.has(id);
