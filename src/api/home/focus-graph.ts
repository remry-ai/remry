// The home page's focus graph: one entity and everything one link away, grouped
// by how the link reads from it, plus a second ring: what each of those links to
// in turn (a few each). Links are relations (including goal–project links),
// ownership, parent/child, group membership (labelled by the group's kind:
// Team, Family) and what the notebook's modules add (a person's lead). Attached
// docs, notes and todos only appear when a relation points at them.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { RelatableType } from '$shared/types/enums';
import {
  focusKey,
  type FocusBranch,
  type FocusGraph,
  type FocusGroup,
  type FocusNode,
  type FocusType
} from '$shared/types/home';
import { entityTypeLabel } from '$shared/utils/entity';
import type { NotebookModel } from '$shared/modules/model';
import { features } from '$shared/settings/base/features';
import { resolveEntityLabel } from '$api/_entity-labels';
import { loadArchivedIds } from '$api/_archive';
import { listRelationsForEntity } from '$api/relation/operations';
import { listPersonGroups } from '$api/group/operations';
import { PERSON_EXTENSIONS } from '$api/modules/person-extensions';
import { focusNode, isFocusType, type FocusLink } from './focus-node';

/** Groups in reading order; any other label goes after these. */
const GROUP_ORDER: readonly string[] = [
  'Part of',
  'Contains',
  'Reports to',
  'Lead of',
  'Direct reports',
  'Member of',
  'Members',
  'Owned by',
  'Owns',
  'Depends on',
  'Needed by',
  'Related to',
  'Mentions',
  'Mentioned in'
];

/** A link whose label is a group kind (Team, Family) reads in the "Member of" slot. */
export const MEMBERSHIP_RANK = GROUP_ORDER.indexOf('Member of');

const orderOf = (label: string, ranks: ReadonlyMap<string, number>): number => {
  const i = ranks.get(label) ?? GROUP_ORDER.indexOf(label);
  return i === -1 ? GROUP_ORDER.length : i;
};

/**
 * Groups the focus's links by label, in `GROUP_ORDER`, each sorted by name and
 * capped at `cap` (the rest counted in `more`). The same entity under the same
 * label shows once, and the focus itself never shows as its own neighbour.
 */
export const buildFocusGraph = (focus: FocusNode, links: readonly FocusLink[], cap = 8): FocusGraph => {
  const byLabel = new Map<string, Map<string, FocusNode>>();
  const ranks = new Map<string, number>();
  for (const { label, node, rank } of links) {
    if (rank !== undefined) ranks.set(label, rank);
    if (node.type === focus.type && node.id === focus.id) continue;
    const group = byLabel.get(label) ?? new Map<string, FocusNode>();
    group.set(`${node.type}:${node.id}`, node);
    byLabel.set(label, group);
  }
  const groups: FocusGroup[] = [...byLabel.entries()]
    .sort(([a], [b]) => orderOf(a, ranks) - orderOf(b, ranks) || a.localeCompare(b))
    .map(([label, nodes]) => {
      const sorted = [...nodes.values()].sort((a, b) => a.label.localeCompare(b.label));
      return { label, nodes: sorted.slice(0, cap), more: Math.max(0, sorted.length - cap) };
    });
  return { focus, groups, branches: {} };
};

/**
 * The outer ring: for each first-ring node, its own neighbours that aren't the
 * focus, aren't on the first ring, and haven't been placed under an earlier node,
 * sorted by name and capped at `cap`.
 */
export const buildBranches = (
  graph: FocusGraph,
  linksOf: ReadonlyMap<string, readonly FocusLink[]>,
  cap = 4
): Readonly<Record<string, FocusBranch>> => {
  if (!graph.focus) return {};
  const shown = new Set([focusKey(graph.focus), ...graph.groups.flatMap((g) => g.nodes.map(focusKey))]);
  const branches: Record<string, FocusBranch> = {};
  for (const node of graph.groups.flatMap((g) => g.nodes)) {
    const key = focusKey(node);
    const fresh = new Map<string, FocusNode>();
    for (const link of linksOf.get(key) ?? []) {
      const k = focusKey(link.node);
      if (!shown.has(k)) fresh.set(k, link.node);
    }
    if (fresh.size === 0) continue;
    const sorted = [...fresh.values()].sort((a, b) => a.label.localeCompare(b.label));
    const kept = sorted.slice(0, cap);
    for (const n of kept) shown.add(focusKey(n));
    branches[key] = { nodes: kept, more: sorted.length - kept.length };
  }
  return branches;
};

// ----- Loading -----

interface Named {
  readonly id: string;
  readonly name: string;
}

const links = (label: string, type: RelatableType, rows: readonly Named[]): FocusLink[] =>
  rows.map((r) => ({ label, node: focusNode(type, r.id, r.name) }));

const titled = (rows: readonly { readonly id: string; readonly title: string }[]): Named[] =>
  rows.map((r) => ({ id: r.id, name: r.title }));

const ownerLink = async (
  reg: Pick<Registry, 'prisma'>,
  row: { readonly ownerType: string | null; readonly ownerId: string | null } | null
): Promise<FocusLink[]> => {
  if (!row?.ownerType || !row.ownerId || !isFocusType(row.ownerType)) return [];
  const label = await resolveEntityLabel(reg, row.ownerType, row.ownerId);
  return label === null ? [] : [{ label: 'Owned by', node: focusNode(row.ownerType, row.ownerId, label) }];
};

const ownedLinks = async (reg: Pick<Registry, 'prisma'>, type: FocusType, id: string): Promise<FocusLink[]> => {
  const where = { where: { ownerType: type, ownerId: id } };
  const [projects, goals] = await Promise.all([
    reg.prisma.project.findMany({ ...where, select: { id: true, name: true } }),
    reg.prisma.goal.findMany({ ...where, select: { id: true, title: true } })
  ]);
  return [...links('Owns', 'PROJECT', projects), ...links('Owns', 'GOAL', titled(goals))];
};

/** Links that come from the focus's own columns and join tables, not from relations. */
const structuralLinks = async (
  reg: Pick<Registry, 'prisma'>,
  type: FocusType,
  id: string,
  model: NotebookModel
): Promise<FocusLink[]> => {
  const p = reg.prisma;
  const named = { select: { id: true, name: true } };
  switch (type) {
    case 'PERSON': {
      // Every group the person is in, under its kind's name (Team, Family), and what the notebook's modules add.
      const groups = await listPersonGroups(reg, id);
      const extensions = Object.values(PERSON_EXTENSIONS).filter((ext) => model.has(ext.module));
      const extended = await Promise.all(extensions.map((ext) => ext.structuralLinks(reg, id)));
      return [
        ...groups.map((g) => ({ label: g.kindName, rank: MEMBERSHIP_RANK, node: focusNode('GROUP', g.id, g.name) })),
        ...extended.flat(),
        ...(await ownedLinks(reg, type, id))
      ];
    }
    case 'GROUP': {
      const members = await p.groupMember.findMany({ where: { groupId: id }, select: { person: named } });
      return [...links('Members', 'PERSON', members.map((m) => m.person)), ...(await ownedLinks(reg, type, id))];
    }
    case 'PROJECT': {
      const project = await p.project.findUnique({
        where: { id },
        select: { ownerType: true, ownerId: true, parent: named }
      });
      const children = await p.project.findMany({ where: { parentId: id }, ...named });
      return [
        ...links('Part of', 'PROJECT', project?.parent ? [project.parent] : []),
        ...links('Contains', 'PROJECT', children),
        ...(await ownerLink(reg, project))
      ];
    }
    case 'GOAL': {
      const t = { select: { id: true, title: true } };
      const goal = await p.goal.findUnique({ where: { id }, select: { ownerType: true, ownerId: true, parent: t } });
      const children = await p.goal.findMany({ where: { parentId: id }, ...t });
      return [
        ...links('Part of', 'GOAL', goal?.parent ? titled([goal.parent]) : []),
        ...links('Contains', 'GOAL', titled(children)),
        ...(await ownerLink(reg, goal))
      ];
    }
    case 'PAGE': {
      const t = { select: { id: true, title: true } };
      const page = await p.page.findUnique({ where: { id }, select: { parent: t } });
      const children = await p.page.findMany({ where: { parentId: id }, ...t });
      return [
        ...links('Part of', 'PAGE', page?.parent ? titled([page.parent]) : []),
        ...links('Contains', 'PAGE', titled(children))
      ];
    }
  }
};

/** The most recently updated active project, goal or group (a goal only when the notebook has goals). */
const defaultFocus = async (
  reg: Pick<Registry, 'prisma'>,
  withGoals: boolean
): Promise<{ readonly type: FocusType; readonly id: string } | null> => {
  const latest = { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' as const }, select: { id: true, updatedAt: true } };
  const [project, goal, group] = await Promise.all([
    reg.prisma.project.findFirst(latest),
    withGoals ? reg.prisma.goal.findFirst(latest) : Promise.resolve(null),
    reg.prisma.group.findFirst(latest)
  ]);
  const candidates = [
    project && { type: 'PROJECT' as const, ...project },
    goal && { type: 'GOAL' as const, ...goal },
    group && { type: 'GROUP' as const, ...group }
  ].filter((c) => c !== null);
  const newest = candidates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  return newest ? { type: newest.type, id: newest.id } : null;
};

type ArchivedIds = Awaited<ReturnType<typeof loadArchivedIds>>;

/** Everything one link away from an entity, minus archived entities and the types left out. */
const loadLinks = async (
  reg: Pick<Registry, 'prisma'>,
  target: { readonly type: FocusType; readonly id: string },
  archived: ArchivedIds,
  model: NotebookModel
): Promise<Result<readonly FocusLink[]>> => {
  const [relations, structural] = await Promise.all([
    listRelationsForEntity(reg, target.type, target.id),
    structuralLinks(reg, target.type, target.id, model)
  ]);
  if (!relations.ok) return relations;

  const relationLinks: FocusLink[] = relations.value.flatMap((group) =>
    group.items.map((item) => ({
      label: item.label,
      node: focusNode(item.other.entityType, item.other.entityId, item.other.label ?? '(untitled)', item.other.path)
    }))
  );

  const isArchived = (node: FocusNode): boolean =>
    isFocusType(node.type) && (archived.get(node.type) ?? []).includes(node.id);
  return ok([...structural, ...relationLinks].filter(
    ({ node }) => !isArchived(node) && model.shows(node.type) && (features.reports || node.type !== 'REPORT')
  ));
};

/** The notebook's model decides which types show (no goals in a home notebook) and which modules add links. */
export const getFocusGraph = async (
  reg: Pick<Registry, 'prisma'>,
  model: NotebookModel,
  requested?: { readonly type: FocusType; readonly id: string }
): Promise<Result<FocusGraph>> => {
  const target = requested ?? (await defaultFocus(reg, model.shows('GOAL')));
  if (!target) return ok({ focus: null, groups: [], branches: {} });

  const label = await resolveEntityLabel(reg, target.type, target.id);
  if (label === null) {
    return err(new Error(`No ${entityTypeLabel(target.type).toLowerCase()} with id ${target.id}. Find ids with ${target.type.toLowerCase()}.list.`));
  }

  const archived = await loadArchivedIds(reg);
  const first = await loadLinks(reg, target, archived, model);
  if (!first.ok) return first;
  const graph = buildFocusGraph(focusNode(target.type, target.id, label), first.value);

  // The second ring: each first-ring entity that can be a focus, one hop further.
  const ring = graph.groups.flatMap((g) => g.nodes).filter((n): n is FocusNode & { type: FocusType } => isFocusType(n.type));
  const seen = new Set<string>();
  const outer = await Promise.all(
    ring
      .filter((n) => !seen.has(focusKey(n)) && seen.add(focusKey(n)))
      .map(async (n) => [focusKey(n), await loadLinks(reg, n, archived, model)] as const)
  );
  const linksOf = new Map(outer.map(([key, links]) => [key, links.ok ? links.value : []]));
  return ok({ ...graph, branches: buildBranches(graph, linksOf) });
};
