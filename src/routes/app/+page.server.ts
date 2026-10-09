import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { FOCUS_TYPES, parseHomeTodoSort } from '$shared/types/home';
import { parseTypedIdValue } from '$shared/utils/entity';
import { notebookModel } from '$shared/modules/model';
import { upcomingBirthdays } from '$shared/utils/birthday';
import { clampPage, parsePageParam } from '$lib/ui/pager';

/** Open todos per page of the home Todos panel. */
const TODO_PAGE_SIZE = 15;

export const load: PageServerLoad = async ({ fetch, url, locals }) => {
  const client = trpc(fetch);
  const focus = parseTypedIdValue(url.searchParams.get('focus') ?? '', FOCUS_TYPES);
  const showBirthdays = notebookModel(locals.notebook.profile).homeWidgets.includes('birthdays');
  const todoSort = parseHomeTodoSort(url.searchParams.get('todoSort'));
  const todoPageQuery = (page: number) =>
    client.home.todos.query({ limit: TODO_PAGE_SIZE, offset: (page - 1) * TODO_PAGE_SIZE, sort: todoSort });
  const requestedPage = parsePageParam(url.searchParams.get('todoPage'));
  const [firstTry, updates, graph, persons] = await Promise.all([
    todoPageQuery(requestedPage),
    client.home.updates.query({ limit: 12 }),
    client.home.graph.query(focus ? { focusType: focus.type, focusId: focus.id } : {}),
    showBirthdays ? client.person.list.query({}) : Promise.resolve(null)
  ]);
  // A page past the end (todos were closed since) shows the last page instead.
  const todoPage = firstTry.ok ? clampPage(requestedPage, firstTry.value.total, TODO_PAGE_SIZE) : 1;
  const todos = todoPage === requestedPage ? firstTry : await todoPageQuery(todoPage);
  const birthdays = persons?.ok
    ? upcomingBirthdays(persons.value.map((p) => ({ id: p.id, name: p.name, birthday: p.extensions.personal?.birthday ?? null })), new Date()).map((b) => ({
      id: b.item.id,
      name: b.item.name,
      birthday: b.item.birthday ?? '',
      inDays: b.inDays,
      turns: b.turns
    }))
    : null;
  return {
    todos: todos.ok ? todos.value : { items: [], total: 0 },
    todoPage,
    todoPageSize: TODO_PAGE_SIZE,
    updates: updates.ok ? updates.value : [],
    graph: graph.ok ? graph.value : { focus: null, groups: [], branches: {} },
    birthdays
  };
};
