import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { parseArchiveFilter } from '$shared/utils/archive';
import { FOCUS_TYPES } from '$shared/types/home';
import { parseTypedIdValue } from '$shared/utils/entity';
import { defaultPeopleFocus, defaultPeopleView, parsePeopleView } from '$lib/person/people-view';

export const load: PageServerLoad = async ({ fetch, url, locals }) => {
  const client = trpc(fetch);
  const profile = locals.notebook.profile;
  const view = parsePeopleView(url.searchParams.get('view'), profile);
  const persons = await client.person.list.query({ archived: parseArchiveFilter(url.searchParams.get('archived')) });

  // The graph centres on `?focus=` (a click moves it), else on me, else the first person.
  const asked = parseTypedIdValue(url.searchParams.get('focus') ?? '', FOCUS_TYPES);
  const fallback = persons.ok ? defaultPeopleFocus(persons.value) : null;
  const focus = asked ?? (fallback ? { type: 'PERSON' as const, id: fallback } : null);
  const graph = view === 'graph' && focus ? await client.home.graph.query({ focusType: focus.type, focusId: focus.id }) : null;

  return {
    persons,
    view,
    defaultView: defaultPeopleView(profile),
    graph: graph?.ok ? graph.value : null
  };
};
