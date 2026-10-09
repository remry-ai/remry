// Parent/child hierarchies (projects, goals, pages): cycle checks and trees.

/** True when making `newParentId` the parent of `id` would make `id` its own ancestor. */
export const wouldCreateCycle = (
  parentOf: (id: string) => string | null | undefined,
  id: string,
  newParentId: string | null
): boolean => {
  const seen = new Set<string>();
  let current = newParentId;
  while (current) {
    if (current === id) return true;
    // A loop that doesn't include `id` is already there; stop rather than spin.
    if (seen.has(current)) return false;
    seen.add(current);
    current = parentOf(current) ?? null;
  }
  return false;
};

/**
 * The ancestors of `id`, root first: its parent's parent's… down to its parent.
 * The chain stops at a parent that isn't in `items`, and at a loop.
 */
export const ancestorsOf = <T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
  getParentId: (item: T) => string | null | undefined
): readonly T[] => {
  const byId = new Map(items.map((item): [string, T] => [item.id, item]));
  const chain: T[] = [];
  const seen = new Set([id]);
  let parentId = byId.has(id) ? getParentId(byId.get(id)!) : null;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parentId);
    chain.push(parent);
    parentId = getParentId(parent);
  }
  return chain.reverse();
};

export interface TreeNode<T> {
  readonly item: T;
  readonly depth: number;
  readonly children: readonly TreeNode<T>[];
}

/**
 * A forest from flat items, keeping their order. Items whose parent isn't in
 * the list are roots. Items caught in a parent cycle also become roots, so
 * nothing disappears.
 */
export const buildTree = <T extends { readonly id: string }>(
  items: readonly T[],
  getParentId: (item: T) => string | null | undefined
): readonly TreeNode<T>[] => {
  const ids = new Set(items.map((item) => item.id));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];

  for (const item of items) {
    const parentId = getParentId(item);
    if (parentId && parentId !== item.id && ids.has(parentId)) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), item]);
    } else {
      roots.push(item);
    }
  }

  const visited = new Set<string>();
  const build = (item: T, depth: number): TreeNode<T> => {
    visited.add(item.id);
    const children: TreeNode<T>[] = [];
    for (const child of childrenOf.get(item.id) ?? []) {
      if (!visited.has(child.id)) children.push(build(child, depth + 1));
    }
    return { item, depth, children };
  };

  const forest = roots.map((root) => build(root, 0));
  for (const item of items) {
    if (!visited.has(item.id)) forest.push(build(item, 0));
  }
  return forest;
};

/**
 * Depth-first rows for rendering a tree as a flat, indented list. A node that
 * `isCollapsed` is still a row, but its descendants are not.
 */
export const flattenTree = <N extends { readonly children: readonly N[] }>(
  forest: readonly N[],
  isCollapsed?: (node: N) => boolean
): readonly N[] =>
  forest.flatMap((node) => [node, ...(isCollapsed?.(node) ? [] : flattenTree(node.children, isCollapsed))]);

export interface ScopedNode<T> {
  readonly item: T;
  readonly depth: number;
  /** True when the item doesn't match but is kept because a descendant does. */
  readonly context: boolean;
  readonly children: readonly ScopedNode<T>[];
}

/**
 * The part of a forest that `matches`: matching nodes, plus the ancestors that
 * lead to them (marked `context`). Everything else is dropped; depths stay.
 */
export const scopeTree = <T>(
  forest: readonly TreeNode<T>[],
  matches: (item: T) => boolean
): readonly ScopedNode<T>[] =>
  forest.flatMap((node) => {
    const children = scopeTree(node.children, matches);
    const isMatch = matches(node.item);
    return isMatch || children.length > 0 ? [{ item: node.item, depth: node.depth, context: !isMatch, children }] : [];
  });
