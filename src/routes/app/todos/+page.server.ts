import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';

export const load: PageServerLoad = async ({ fetch }) => {
  const client = trpc(fetch);
  const todos = await client.todo.list.query({});
  return { todos };
};
