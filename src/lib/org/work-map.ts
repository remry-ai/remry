// The Org Map's Work view: one lane per group (teams, then departments, then
// other kinds) or person that owns
// work, with the projects and goals it owns laid out to the right, and the
// dependencies and goal links between them drawn across lanes. Teams aren't
// part of a department, so a team lane shows where its people come from,
// counted from department membership. Pure.

import type { GoalStatus } from '$shared/types/enums';
import type { EntityOwner } from '$shared/types/owner';
import type { ProjectDependencies } from '$shared/types/project-dependencies';
import { entityPath } from '$shared/utils/entity';
import { goalDetail, goalTone, projectTone, type MapTone } from '$lib/project/dependency-map';

export interface WorkProject {
  readonly id: string;
  readonly name: string;
  readonly status: string | null;
  readonly owner: EntityOwner | null;
}

export interface WorkGoal {
  readonly id: string;
  readonly title: string;
  readonly status: GoalStatus;
  readonly progress: number | null;
  readonly owner: EntityOwner | null;
}

interface Group {
  readonly id: string;
  readonly name: string;
  readonly members: readonly { readonly personId: string }[];
}

export interface WorkMapInput {
  readonly projects: readonly WorkProject[];
  readonly goals: readonly WorkGoal[];
  readonly dependencies: ProjectDependencies;
  readonly teams: readonly Group[];
  readonly departments: readonly Group[];
}

export interface WorkItem {
  /** `P:<id>` or `G:<id>`. */
  readonly key: string;
  readonly kind: 'PROJECT' | 'GOAL';
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: MapTone;
  readonly href: string;
}

export interface DepartmentCount {
  readonly name: string;
  readonly count: number;
}

export interface WorkLane {
  /** `GROUP:<id>`, `PERSON:<id>`, or `NONE` for unowned work. */
  readonly key: string;
  /** A group lane reads as its kind: TEAM, DEPARTMENT, or GROUP for any other kind. */
  readonly kind: 'TEAM' | 'DEPARTMENT' | 'GROUP' | 'PERSON' | 'NONE';
  readonly label: string;
  readonly href: string | null;
  /** For a team: its members by department, most first. */
  readonly departments: readonly DepartmentCount[];
  readonly items: readonly WorkItem[];
}

export interface WorkEdge {
  /** Upstream: the project depended on, or the project delivering a goal. */
  readonly source: string;
  readonly target: string;
  readonly kind: 'DEPENDS_ON' | 'GOAL';
}

export interface WorkMap {
  readonly lanes: readonly WorkLane[];
  readonly edges: readonly WorkEdge[];
}

export const NO_DEPARTMENT = 'No department';

const KIND_ORDER: Readonly<Record<WorkLane['kind'], number>> = { TEAM: 0, DEPARTMENT: 1, GROUP: 2, PERSON: 3, NONE: 4 };
const STATUS_ORDER: Readonly<Record<string, number>> = { active: 0, planning: 1 };

/** A team's members counted by department, most first; people in none count as `NO_DEPARTMENT`. */
export const teamDepartments = (team: Group, departments: readonly Group[]): readonly DepartmentCount[] => {
  const departmentsOf = new Map<string, string[]>();
  for (const d of departments) {
    for (const m of d.members) departmentsOf.set(m.personId, [...(departmentsOf.get(m.personId) ?? []), d.name]);
  }
  const counts = new Map<string, number>();
  for (const m of team.members) {
    for (const name of departmentsOf.get(m.personId) ?? [NO_DEPARTMENT]) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

export const buildWorkMap = (input: WorkMapInput): WorkMap => {
  const teams = new Map(input.teams.map((t) => [t.id, t]));
  const departmentIds = new Set(input.departments.map((d) => d.id));
  const laneKind = (owner: EntityOwner | null): WorkLane['kind'] => {
    if (!owner) return 'NONE';
    if (owner.type === 'PERSON') return 'PERSON';
    return teams.has(owner.id) ? 'TEAM' : departmentIds.has(owner.id) ? 'DEPARTMENT' : 'GROUP';
  };
  const lanes = new Map<string, { kind: WorkLane['kind']; id: string | null; label: string; href: string | null; items: WorkItem[] }>();
  const laneFor = (owner: EntityOwner | null) => {
    const key = owner ? `${owner.type}:${owner.id}` : 'NONE';
    const lane = lanes.get(key) ?? {
      kind: laneKind(owner),
      id: owner?.id ?? null,
      label: owner ? owner.label ?? 'Unknown owner' : 'No owner',
      href: owner?.path ?? null,
      items: []
    };
    lanes.set(key, lane);
    return lane;
  };

  const projects = [...input.projects].sort(
    (a, b) => (STATUS_ORDER[a.status ?? ''] ?? 2) - (STATUS_ORDER[b.status ?? ''] ?? 2) || a.name.localeCompare(b.name)
  );
  for (const p of projects) {
    laneFor(p.owner).items.push({
      key: `P:${p.id}`,
      kind: 'PROJECT',
      id: p.id,
      label: p.name,
      detail: p.status ?? 'No status',
      tone: projectTone(p.status),
      href: entityPath('PROJECT', p.id)
    });
  }
  for (const g of [...input.goals].sort((a, b) => a.title.localeCompare(b.title))) {
    laneFor(g.owner).items.push({
      key: `G:${g.id}`,
      kind: 'GOAL',
      id: g.id,
      label: g.title,
      detail: goalDetail(g),
      tone: goalTone(g.status),
      href: entityPath('GOAL', g.id)
    });
  }

  const ordered: WorkLane[] = [...lanes.entries()]
    .map(([key, lane]) => {
      const team = lane.kind === 'TEAM' && lane.id ? teams.get(lane.id) : undefined;
      return {
        key,
        kind: lane.kind,
        label: lane.label,
        href: lane.href,
        departments: team ? teamDepartments(team, input.departments) : [],
        items: lane.items
      };
    })
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.items.length - a.items.length || a.label.localeCompare(b.label)
    );

  const shown = new Set(ordered.flatMap((l) => l.items.map((i) => i.key)));
  const seen = new Set<string>();
  const edges: WorkEdge[] = [];
  const add = (edge: WorkEdge) => {
    const id = `${edge.source}>${edge.target}`;
    if (edge.source === edge.target || seen.has(id) || !shown.has(edge.source) || !shown.has(edge.target)) return;
    seen.add(id);
    edges.push(edge);
  };
  for (const e of input.dependencies.edges) add({ source: `P:${e.toId}`, target: `P:${e.fromId}`, kind: 'DEPENDS_ON' });
  for (const l of input.dependencies.goalLinks) add({ source: `P:${l.projectId}`, target: `G:${l.goalId}`, kind: 'GOAL' });

  return { lanes: ordered, edges };
};

// ----- Pixel layout -----

export interface WorkSizes {
  readonly width: number;
  readonly headerWidth: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly gapX: number;
  readonly gapY: number;
  readonly lanePad: number;
  readonly laneMinHeight: number;
  readonly pad: number;
}

export const WORK_SIZES: WorkSizes = {
  width: 1200,
  headerWidth: 220,
  cardWidth: 200,
  cardHeight: 40,
  gapX: 40,
  gapY: 16,
  lanePad: 14,
  laneMinHeight: 64,
  pad: 12
};

export interface PlacedLane extends WorkLane {
  readonly y: number;
  readonly height: number;
}

export interface PlacedItem extends WorkItem {
  readonly lane: string;
  readonly x: number;
  readonly y: number;
}

export interface PlacedWorkEdge extends WorkEdge {
  readonly path: string;
}

export interface WorkLayout {
  readonly lanes: readonly PlacedLane[];
  readonly items: readonly PlacedItem[];
  readonly edges: readonly PlacedWorkEdge[];
  readonly width: number;
  readonly height: number;
  /** Cards per row in a lane. */
  readonly perRow: number;
}

/** A curve between two cards: side to side when they're apart, else top to bottom. */
const edgePath = (a: PlacedItem, b: PlacedItem, s: WorkSizes): string => {
  const { cardWidth: w, cardHeight: h } = s;
  if (b.x >= a.x + w || a.x >= b.x + w) {
    const forward = b.x >= a.x + w;
    const x1 = forward ? a.x + w : a.x;
    const x2 = forward ? b.x : b.x + w;
    const y1 = a.y + h / 2;
    const y2 = b.y + h / 2;
    const bend = Math.max(24, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  }
  const down = b.y > a.y;
  const x1 = a.x + w / 2;
  const x2 = b.x + w / 2;
  const y1 = down ? a.y + h : a.y;
  const y2 = down ? b.y : b.y + h;
  const bend = Math.max(16, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
};

export const layoutWorkMap = (map: WorkMap, sizes: WorkSizes = WORK_SIZES): WorkLayout => {
  const { width, headerWidth, cardWidth, cardHeight, gapX, gapY, lanePad, laneMinHeight, pad } = sizes;
  const itemsLeft = pad + headerWidth;
  const perRow = Math.max(1, Math.floor((width - itemsLeft - pad + gapX) / (cardWidth + gapX)));

  const lanes: PlacedLane[] = [];
  const items: PlacedItem[] = [];
  let y = pad;
  for (const lane of map.lanes) {
    const rows = Math.max(1, Math.ceil(lane.items.length / perRow));
    const height = Math.max(laneMinHeight, rows * (cardHeight + gapY) - gapY + lanePad * 2);
    lane.items.forEach((item, i) => {
      items.push({
        ...item,
        lane: lane.key,
        x: itemsLeft + (i % perRow) * (cardWidth + gapX),
        y: y + lanePad + Math.floor(i / perRow) * (cardHeight + gapY)
      });
    });
    lanes.push({ ...lane, y, height });
    y += height;
  }

  const at = new Map(items.map((i) => [i.key, i]));
  const edges = map.edges.flatMap((e) => {
    const a = at.get(e.source);
    const b = at.get(e.target);
    return a && b ? [{ ...e, path: edgePath(a, b, sizes) }] : [];
  });

  return { lanes, items, edges, width, height: lanes.length > 0 ? y + pad : 0, perRow };
};
