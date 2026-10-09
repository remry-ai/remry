import { RELATABLE_TYPES, type EntityType, type RelatableType } from '$shared/types/enums';
import { ENTITY_DESCRIPTORS, LEGACY_SEGMENTS } from '$shared/entities/descriptors';

export interface EntityRef {
  readonly entityType: EntityType;
  readonly entityId: string;
}

// entityPath and parseEntityPath both read the descriptors' segments, so a link
// built from a path always parses back to its entity.
const SEGMENT_TYPES: ReadonlyMap<string, EntityType> = new Map([
  ...Object.values(ENTITY_DESCRIPTORS).flatMap((d): [string, EntityType][] => (d.segment ? [[d.segment, d.type]] : [])),
  ...Object.entries(LEGACY_SEGMENTS)
]);

/** App route for a polymorphic entity reference. */
export const entityPath = (entityType: EntityType, entityId: string): string => {
  const segment = ENTITY_DESCRIPTORS[entityType].segment;
  return segment ? `/app/${segment}/${entityId}` : `/app/${entityType.toLowerCase()}/${entityId}`;
};

/** App route for an entity page with one of its docs open (`?doc=<id>`). */
export const docPath = (entityType: EntityType, entityId: string, docId: string): string =>
  `${entityPath(entityType, entityId)}?doc=${encodeURIComponent(docId)}`;

/** The type's singular name. A group's own page says its kind instead (Team, Family). */
export const entityTypeLabel = (entityType: EntityType): string => ENTITY_DESCRIPTORS[entityType].singular;

/** Whether docs can attach to this entity type. A wiki page is its own content, so it takes none. */
export const acceptsDocs = (entityType: string): boolean => entityType !== 'PAGE';

/** `TYPE:id`, so one <select> can offer entities of several types. */
export const typedIdValue = (type: string, id: string): string => `${type}:${id}`;

/** Reads a `typedIdValue` back, or null when it's malformed or its type isn't one of `types`. */
export const parseTypedIdValue = <T extends string>(
  value: string,
  types: readonly T[]
): { readonly type: T; readonly id: string } | null => {
  const at = value.indexOf(':');
  const type = value.slice(0, at) as T;
  const id = value.slice(at + 1);
  return at > 0 && id && types.includes(type) ? { type, id } : null;
};

/** Types an entity search offers (the add-link form, the ⌘K finder), in order, with the singular word `/` picks each by. */
export const ENTITY_SEARCH_SCOPES: readonly { readonly id: RelatableType; readonly label: string; readonly slash: string }[] =
  RELATABLE_TYPES.flatMap((type) => {
    const d = ENTITY_DESCRIPTORS[type];
    return d.slash ? [{ id: type, label: type === 'PAGE' ? 'Wiki' : d.singular, slash: d.slash }] : [];
  });

// The app only listens on loopback, so an absolute link to it uses one of these hosts.
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?=\/)/i;
const APP_PATH = /^\/app\/([a-z]+)\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/;

/** The entity an app link points at (`/app/wiki/<id>`, relative or on a loopback origin), or null. */
export const parseEntityPath = (href: string): EntityRef | null => {
  const match = APP_PATH.exec(href.trim().replace(LOOPBACK_ORIGIN, ''));
  const entityType = match ? SEGMENT_TYPES.get(match[1]!) : undefined;
  return match && entityType ? { entityType, entityId: match[2]! } : null;
};
