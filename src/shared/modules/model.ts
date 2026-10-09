// What a notebook is made of: the core plus its profile's modules. Pure and
// client-safe; the app layout, the tRPC context and route guards all read it,
// so nothing else asks which profile a notebook has.

import { ENTITY_TYPES, type EntityType } from '$shared/types/enums';
import type { NotebookProfile } from '$shared/types/notebook';
import { ENTITY_DESCRIPTORS, type EntityDescriptor } from '$shared/entities/descriptors';
import { features } from '$shared/settings/base/features';
import { GOALS_MODULE } from './goals';
import { ORG_MODULE } from './org';
import { PERSONAL_MODULE } from './personal';
import type { GroupKindSeed, ModuleDefinition, ModuleId, NavItem, PersonFieldDescriptor, PersonRelationKindSeed } from './types';

export const MODULES: Readonly<Record<ModuleId, ModuleDefinition>> = {
  org: ORG_MODULE,
  personal: PERSONAL_MODULE,
  goals: GOALS_MODULE
};

export const MODULES_BY_PROFILE: Readonly<Record<NotebookProfile, readonly ModuleId[]>> = {
  work: ['org', 'goals'],
  home: ['personal']
};

const CORE_NAV: readonly NavItem[] = [
  { href: '/app', label: 'Home' },
  { href: '/app/people', label: 'People' },
  { href: '/app/groups', label: 'Groups' },
  { href: '/app/projects', label: 'Projects' },
  { href: '/app/wiki', label: 'Wiki' },
  ...(features.reports ? [{ href: '/app/reports', label: 'Reports' }] : []),
  { href: '/app/todos', label: 'Todos' }
];

export interface NotebookModel {
  readonly profile: NotebookProfile;
  readonly modules: readonly ModuleId[];
  readonly has: (module: ModuleId) => boolean;
  /** Entity types this notebook shows (the core's, plus its modules'). */
  readonly entityTypes: readonly EntityType[];
  readonly shows: (type: EntityType) => boolean;
  readonly entity: (type: EntityType) => EntityDescriptor;
  readonly nav: readonly NavItem[];
  readonly personFields: readonly PersonFieldDescriptor[];
  /** Relation kinds the modules bring (seeded into the notebook; the notebook can add its own). */
  readonly personRelationKinds: readonly PersonRelationKindSeed[];
  readonly groupKinds: readonly GroupKindSeed[];
  readonly homeWidgets: readonly 'birthdays'[];
  /** The module that owns an app route this notebook doesn't have, or null when it's open. */
  readonly routeOwner: (pathname: string) => ModuleId | null;
  /** The module that owns a procedure this notebook doesn't have, or null when it's open. */
  readonly procedureOwner: (path: string) => ModuleId | null;
}

/** Types only some module has; the rest are core. */
const MODULE_TYPES = new Set(Object.values(MODULES).flatMap((m) => m.entityTypes));

const placeNav = (core: readonly NavItem[], added: readonly NavItem[]): readonly NavItem[] => {
  const replaced = new Set(added.flatMap((item) => item.replaces ?? []));
  let nav = core.filter((item) => !replaced.has(item.href));
  for (const item of added) {
    const at = item.after ? nav.findIndex((n) => n.href === item.after) : -1;
    nav = at === -1 ? [...nav, item] : [...nav.slice(0, at + 1), item, ...nav.slice(at + 1)];
  }
  return nav;
};

const startsWith = (value: string, prefix: string): boolean => value === prefix || value.startsWith(prefix.endsWith('.') ? prefix : `${prefix}/`);

export const notebookModel = (profile: NotebookProfile): NotebookModel => {
  const modules = MODULES_BY_PROFILE[profile];
  const active = modules.map((id) => MODULES[id]);
  const inactive = Object.values(MODULES).filter((m) => !modules.includes(m.id));
  const entityTypes = ENTITY_TYPES.filter((type) => !MODULE_TYPES.has(type) || active.some((m) => m.entityTypes.includes(type)));
  const owner = (match: (m: ModuleDefinition) => boolean): ModuleId | null => inactive.find(match)?.id ?? null;

  return {
    profile,
    modules,
    has: (id) => modules.includes(id),
    entityTypes,
    shows: (type) => entityTypes.includes(type),
    entity: (type) => ENTITY_DESCRIPTORS[type],
    nav: placeNav(CORE_NAV, active.flatMap((m) => m.nav)),
    personFields: active.flatMap((m) => m.personFields),
    personRelationKinds: active.flatMap((m) => m.personRelationKinds),
    groupKinds: active.flatMap((m) => m.groupKinds),
    homeWidgets: active.flatMap((m) => m.homeWidgets),
    routeOwner: (pathname) => owner((m) => m.routes.some((r) => startsWith(pathname, r))),
    procedureOwner: (path) => owner((m) => m.procedures.some((p) => path.startsWith(p)))
  };
};

/** The actionable message for something a notebook's modules don't include. */
export const notInModelMessage = (model: NotebookModel, module: ModuleId, what: string): string =>
  `${what} belongs to the ${MODULES[module].name} module, which a ${model.profile} notebook doesn't use. ` +
  `Use a notebook with the ${model.profile === 'home' ? 'work' : 'home'} profile, or change this one with notebook.setProfile.`;
