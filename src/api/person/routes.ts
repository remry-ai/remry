import { z } from 'zod';
import { ARCHIVE_FILTERS } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import { personExtensionsPatch, type PersonExtensionsPatch } from '$shared/types/person';
import type { NotebookModel } from '$shared/modules/model';
import { notInModelMessage } from '$shared/modules/model';
import type { ModuleId } from '$shared/modules/types';
import { err, type Err } from '$shared/utils/result';
import { setArchived } from '$api/_archive';
import { createPerson, deletePerson, getPerson, listPersons, setMe, updatePerson } from './operations';

// Each module's fields under its id: {"org":{"title":"…","leadId":"…"}} or
// {"personal":{"birthday":"--05-03","knownAs":"College friend"}}.
const extensions = personExtensionsPatch.optional();

/** A patch for a module the notebook doesn't use is refused, with what to do instead. */
const checkModules = (model: NotebookModel, patch: PersonExtensionsPatch | undefined): Err | null => {
  const module = (Object.keys(patch ?? {}) as ModuleId[]).find((id) => !model.has(id));
  return module ? err(new Error(notInModelMessage(model, module, `extensions.${module}`))) : null;
};

export const personRouter = router({
  list: procedure
    .input(z.object({ archived: z.enum(ARCHIVE_FILTERS).default('exclude') }).default({}))
    .query(({ ctx, input }) => listPersons(ctx.reg, input.archived)),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getPerson(ctx.reg, input.id)),

  create: procedure
    .input(z.object({
      name: z.string().min(1).max(200),
      email: z.string().email().optional(),
      extensions
    }))
    .mutation(async ({ ctx, input }) => checkModules(ctx.model, input.extensions) ?? createPerson(ctx.reg, input)),

  update: procedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      email: z.string().email().nullable().optional(),
      extensions
    }))
    .mutation(async ({ ctx, input: { id, ...data } }) => checkModules(ctx.model, data.extensions) ?? updatePerson(ctx.reg, id, data)),

  // The notebook's owner: relations to them read as "your …". null: nobody.
  setMe: procedure
    .input(z.object({ id: z.string().nullable() }))
    .mutation(({ ctx, input }) => setMe(ctx.reg, input.id)),

  archive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'PERSON', input.id, true)),

  unarchive: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => setArchived(ctx.reg, 'PERSON', input.id, false)),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => deletePerson(ctx.reg, input.id))
});
