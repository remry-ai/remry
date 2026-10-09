import type { OwnerType } from './enums';

/** The person, team or department a goal or project belongs to. */
export interface EntityOwner {
  readonly type: OwnerType;
  readonly id: string;
  /** Null when the owner no longer exists. */
  readonly label: string | null;
  readonly path: string;
}
