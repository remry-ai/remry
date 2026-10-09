// Teams are groups of kind TEAM now; old links land on the groups list.
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(301, '/app/groups?kind=TEAM');
