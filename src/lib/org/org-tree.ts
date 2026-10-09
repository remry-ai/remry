export interface OrgPerson {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly leadId: string | null;
}

export interface OrgTreeNode<P extends OrgPerson = OrgPerson> {
  readonly person: P;
  readonly children: readonly OrgTreeNode<P>[];
}

const byName = (a: OrgPerson, b: OrgPerson): number => a.name.localeCompare(b.name);

/**
 * Builds a reporting-line forest from `leadId`. Every person appears exactly once:
 * people whose lead is missing become roots, and reporting cycles are broken at
 * the first (by name) person in the cycle.
 */
export const buildOrgTree = <P extends OrgPerson>(persons: readonly P[]): readonly OrgTreeNode<P>[] => {
  const ids = new Set(persons.map((p) => p.id));
  const sorted = [...persons].sort(byName);
  const reportsByLead = new Map<string, P[]>();
  for (const p of sorted) {
    if (p.leadId && ids.has(p.leadId) && p.leadId !== p.id) {
      const list = reportsByLead.get(p.leadId) ?? [];
      list.push(p);
      reportsByLead.set(p.leadId, list);
    }
  }

  const visited = new Set<string>();
  const walk = (person: P): OrgTreeNode<P> => {
    visited.add(person.id);
    const children = (reportsByLead.get(person.id) ?? [])
      .map((c) => (visited.has(c.id) ? null : walk(c)))
      .filter((n): n is OrgTreeNode<P> => n !== null);
    return { person, children };
  };

  const isRoot = (p: P): boolean => !p.leadId || !ids.has(p.leadId) || p.leadId === p.id;
  const roots = sorted.filter(isRoot).map(walk);
  for (const p of sorted) {
    if (!visited.has(p.id)) roots.push(walk(p));
  }
  return roots;
};

/** Ids from a root down to `id` (inclusive), or an empty list when `id` isn't in the forest. */
export const pathToPerson = (roots: readonly OrgTreeNode[], id: string): readonly string[] => {
  for (const node of roots) {
    if (node.person.id === id) return [id];
    const below = pathToPerson(node.children, id);
    if (below.length > 0) return [node.person.id, ...below];
  }
  return [];
};

export const countDescendants =(node: OrgTreeNode): number =>
  node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
