// A node of the home focus graph, and a link to one. Its own file so modules
// that contribute links (person extensions) and the graph share it without a cycle.

import type { RelatableType } from '$shared/types/enums';
import { FOCUS_TYPES, type FocusNode, type FocusType } from '$shared/types/home';
import { entityPath } from '$shared/utils/entity';

/** One neighbour of the focus, and how the link reads from the focus. */
export interface FocusLink {
  readonly label: string;
  readonly node: FocusNode;
  /** Where the label sorts, for labels that aren't fixed (a group kind's name). */
  readonly rank?: number;
}

export const isFocusType = (type: string): type is FocusType => (FOCUS_TYPES as readonly string[]).includes(type);

export const focusNode = (type: RelatableType, id: string, label: string, href = entityPath(type, id)): FocusNode => ({
  id,
  type,
  label,
  href,
  focusable: isFocusType(type)
});
