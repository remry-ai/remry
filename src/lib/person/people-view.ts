// The People page shows a table or the focus graph (the home page's), chosen by
// `?view=`. A home notebook opens on the graph, centred on "me"; a work notebook
// on the table. Pure, so the load and the page agree.

import type { NotebookProfile } from '$shared/types/notebook';

export const PEOPLE_VIEWS = ['graph', 'table'] as const;

export type PeopleView = (typeof PEOPLE_VIEWS)[number];

export const defaultPeopleView = (profile: NotebookProfile): PeopleView => (profile === 'home' ? 'graph' : 'table');

export const parsePeopleView = (value: string | null, profile: NotebookProfile): PeopleView =>
  (PEOPLE_VIEWS as readonly string[]).includes(value ?? '') ? (value as PeopleView) : defaultPeopleView(profile);

/** The graph's middle when none is asked for: me, else the first person. */
export const defaultPeopleFocus = (
  persons: readonly { readonly id: string; readonly isMe: boolean }[]
): string | null => (persons.find((p) => p.isMe) ?? persons[0])?.id ?? null;
