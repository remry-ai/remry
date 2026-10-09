// One description per entity type: what it's called, where its page is, and
// what the core can do with it. Client-safe. The words for a group come from its
// kind (Team, Family); `Group` is what a list of mixed kinds calls them.

import type { EntityType } from '$shared/types/enums';

export interface EntityDescriptor {
  readonly type: EntityType;
  readonly singular: string;
  readonly plural: string;
  /** The app route segment, for types with their own page: `/app/<segment>/<id>`. */
  readonly segment?: string;
  /** The word `/` picks it by in entity searches (the finder, the add-link form). */
  readonly slash?: string;
}

export const ENTITY_DESCRIPTORS: Readonly<Record<EntityType, EntityDescriptor>> = {
  PERSON: { type: 'PERSON', singular: 'Person', plural: 'People', segment: 'people', slash: 'person' },
  GROUP: { type: 'GROUP', singular: 'Group', plural: 'Groups', segment: 'groups', slash: 'group' },
  PROJECT: { type: 'PROJECT', singular: 'Project', plural: 'Projects', segment: 'projects', slash: 'project' },
  GOAL: { type: 'GOAL', singular: 'Goal', plural: 'Goals', segment: 'goals', slash: 'goal' },
  PAGE: { type: 'PAGE', singular: 'Page', plural: 'Wiki', segment: 'wiki', slash: 'wiki' },
  DOC: { type: 'DOC', singular: 'Doc', plural: 'Docs' },
  NOTE: { type: 'NOTE', singular: 'Note', plural: 'Notes' },
  REPORT: { type: 'REPORT', singular: 'Report', plural: 'Reports', segment: 'reports' },
  TODO: { type: 'TODO', singular: 'Todo', plural: 'Todos' },
  LINK: { type: 'LINK', singular: 'Link', plural: 'Links' },
  TAG: { type: 'TAG', singular: 'Tag', plural: 'Tags' },
  COMMENT: { type: 'COMMENT', singular: 'Comment', plural: 'Comments' },
  EMOJI: { type: 'EMOJI', singular: 'Emoji', plural: 'Emoji' }
};

/** Route segments from before groups had kinds; links to them still parse, and the routes redirect. */
export const LEGACY_SEGMENTS: Readonly<Record<string, EntityType>> = { teams: 'GROUP', departments: 'GROUP' };
