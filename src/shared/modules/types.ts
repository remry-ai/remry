// Modules plug what differs between notebooks into the core: the org chart
// (titles, reporting lines, teams and departments), personal life (birthdays,
// family and friends) and goals. A notebook's profile is a list of modules.
// Client-safe; the server parts (person extensions) are in $api/modules.

import type { EntityType } from '$shared/types/enums';

export const MODULE_IDS = ['org', 'personal', 'goals'] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/** A group kind a module brings, added to a notebook that uses the module. */
export interface GroupKindSeed {
  readonly key: string;
  readonly name: string;
  readonly plural: string;
  readonly exclusive: boolean;
}

/** A person relation kind a module brings ("Lead of" / "Reports to"), added to a notebook that uses the module. */
export interface PersonRelationKindSeed {
  readonly key: string;
  readonly label: string;
  readonly inverseLabel: string;
  readonly symmetric: boolean;
  /** The `to` person has one at most: adding another replaces it. */
  readonly exclusive: boolean;
}

/** A field a module adds to people, kept in the module's own table. */
export interface PersonFieldDescriptor {
  readonly module: ModuleId;
  readonly key: string;
  readonly label: string;
  readonly input: 'text' | 'person' | 'birthday';
  readonly placeholder?: string;
}

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Core nav items this one stands in for (the org map lists people and groups). */
  readonly replaces?: readonly string[];
  /** Placed after this core item; at the end without it. */
  readonly after?: string;
}

export interface ModuleDefinition {
  readonly id: ModuleId;
  readonly name: string;
  readonly groupKinds: readonly GroupKindSeed[];
  readonly personFields: readonly PersonFieldDescriptor[];
  readonly personRelationKinds: readonly PersonRelationKindSeed[];
  /** Entity types only this module has (goals). */
  readonly entityTypes: readonly EntityType[];
  readonly nav: readonly NavItem[];
  /** App routes (prefixes) only this module has. */
  readonly routes: readonly string[];
  /** Procedure prefixes only this module has (`goal.`). */
  readonly procedures: readonly string[];
  readonly homeWidgets: readonly 'birthdays'[];
}
