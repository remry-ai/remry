// An entity page's breadcrumb: the list, the entity's parents, then the entity. A long trail
// would run off the page, so past BREADCRUMB_MAX_CHARS the parents between the list and the
// nearest parent fold into a dropdown. Pure; EntityDetailPage renders it, and CSS truncates
// any one crumb that's still too long.

export interface Crumb {
  readonly label: string;
  readonly href: string;
}

export interface BreadcrumbPlan {
  /** The list, then the folded parents' dropdown (when `folded` has any), then the rest. */
  readonly first: Crumb;
  readonly folded: readonly Crumb[];
  readonly rest: readonly Crumb[];
}

/** Past this many characters across every crumb and the entity's name, the middle folds. */
export const BREADCRUMB_MAX_CHARS = 60;

export const planBreadcrumb = (
  first: Crumb,
  parents: readonly Crumb[],
  current: string,
  maxChars: number = BREADCRUMB_MAX_CHARS
): BreadcrumbPlan => {
  const length = [first, ...parents].reduce((sum, crumb) => sum + crumb.label.length, current.length);
  // Folding one parent into a dropdown saves nothing; keep the nearest parent in view.
  if (length <= maxChars || parents.length < 2) return { first, folded: [], rest: parents };
  return { first, folded: parents.slice(0, -1), rest: parents.slice(-1) };
};
