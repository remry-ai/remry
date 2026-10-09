import type { PageServerLoad } from './$types';
import { getReadyRegistry } from '$shared/db/bootstrap.server';
import { listGroupsWithMembers } from '$api/group/operations';
import { listGroupKinds } from '$api/group-kind/operations';
import { listPersons } from '$api/person/operations';
import { listProjects } from '$api/project/operations';
import { listGoals } from '$api/goal/operations';
import { listProjectDependencies } from '$api/project/dependencies';

// The org module's page: reporting lines (org_person leads), its Team and
// Department groups, and in the Work view who owns which projects and goals.
export const load: PageServerLoad = async ({ locals, url }) => {
  const reg = await getReadyRegistry(locals.notebook.id);
  const isWork = url.searchParams.get('view') === 'work';

  const [kindsResult, departmentsResult, teamsResult, personsResult, projectsResult, goalsResult, dependenciesResult] = await Promise.all([
    listGroupKinds(reg),
    listGroupsWithMembers(reg, { kind: 'DEPARTMENT' }),
    listGroupsWithMembers(reg, { kind: 'TEAM' }),
    listPersons(reg),
    isWork ? listProjects(reg) : null,
    isWork ? listGoals(reg, {}) : null,
    isWork ? listProjectDependencies(reg) : null
  ]);

  const departments = departmentsResult.ok ? departmentsResult.value : [];
  const teams = teamsResult.ok ? teamsResult.value : [];
  const work = projectsResult?.ok && goalsResult?.ok && dependenciesResult?.ok
    ? { projects: projectsResult.value, goals: goalsResult.value, dependencies: dependenciesResult.value, teams, departments }
    : null;

  // The org tree reads each person's lead from the org module's data.
  const persons = (personsResult.ok ? personsResult.value : []).map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    extensions: p.extensions,
    title: p.extensions.org?.title ?? null,
    leadId: p.extensions.org?.leadId ?? null,
    leadName: p.extensions.org?.leadName ?? null
  }));

  return { kinds: kindsResult.ok ? kindsResult.value : [], departments, teams, persons, work };
};
