import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { NOTEBOOK_PROFILES } from '$shared/types/notebook';
import { getReadyRegistry } from '$shared/db/bootstrap.server';
import type { NotebookProfile } from '$shared/types/notebook';
import { notebookModel } from '$shared/modules/model';
import { seedGroupKinds } from '$api/group-kind/operations';
import { seedPersonRelationKinds } from '$api/person-relation-kind/operations';
import { createNotebook, listNotebooks, renameNotebook, setDefaultNotebook, setNotebookProfile } from './operations';

/** The group and relation kinds a profile's modules bring. */
const setUpModules = async (notebookId: string, profile: NotebookProfile): Promise<void> => {
  const reg = await getReadyRegistry(notebookId);
  const model = notebookModel(profile);
  await seedGroupKinds(reg, model.groupKinds);
  await seedPersonRelationKinds(reg, model.personRelationKinds);
};

export const notebookRouter = router({
  list: procedure
    .meta({ description: 'Lists the user\'s notebooks (id, name, profile) and which is the default. Call it first.' })
    .query(({ ctx }) => listNotebooks(ctx, ctx.notebook.id)),

  create: procedure
    .meta({ description: 'Creates a notebook: a separate database with its own people, projects and files. profile picks its modules (work or home).' })
    .input(z.object({
      name: z.string().trim().min(1).max(100),
      id: z.string().max(40).optional(),
      // work: the org chart and goals, with Team and Department groups.
      // home: personal life (birthdays, family relations), with Family and Friends groups.
      profile: z.enum(NOTEBOOK_PROFILES).default('work')
    }))
    .mutation(({ ctx, input }) =>
      createNotebook({ notebooks: ctx.notebooks, now: ctx.reg.now, setUpModules }, input)),

  setProfile: procedure
    .meta({ description: 'Changes a notebook\'s profile (work or home), and so which modules it has. Data from a module it no longer has stays stored.' })
    .input(z.object({
      id: z.string(),
      profile: z.enum(NOTEBOOK_PROFILES)
    }))
    .mutation(({ ctx, input }) => setNotebookProfile({ notebooks: ctx.notebooks, setUpModules }, input.id, input.profile)),

  rename: procedure
    .meta({ description: 'Renames a notebook. Its id stays the same.' })
    .input(z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(100)
    }))
    .mutation(({ ctx, input }) => renameNotebook(ctx, input.id, input.name)),

  setDefault: procedure
    .meta({ description: 'Makes a notebook the default for tools called without `notebook`.' })
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setDefaultNotebook(ctx, input.id)),
});
