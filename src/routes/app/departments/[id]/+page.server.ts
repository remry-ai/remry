// A department kept its id when it became a group.
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => redirect(301, `/app/groups/${params.id}${url.search}`);
