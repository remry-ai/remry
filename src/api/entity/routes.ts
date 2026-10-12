// One archive and one delete for every kind of entity, so Claude has two tools where it
// had one per type (person.archive, project.delete, note.remove…). The per-type
// procedures stay for the app, and are left out of the CLI and MCP (cli/api.ts).

import { z } from 'zod';
import { ARCHIVABLE_TYPES } from '$shared/types/enums';
import { router, procedure } from '$shared/trpc/init';
import type { Registry } from '$shared/registry';
import { notInModelMessage } from '$shared/modules/model';
import { err, type Result } from '$shared/utils/result';
import { setArchived } from '$api/_archive';
import { deletePerson } from '$api/person/operations';
import { deleteGroup } from '$api/group/operations';
import { deleteProject } from '$api/project/operations';
import { deleteGoal } from '$api/goal/operations';
import { deletePage } from '$api/page/operations';
import { deleteTodo } from '$api/attached/todo/operations';
import { removeDoc } from '$api/attached/doc/operations';
import { removeNote } from '$api/attached/note/operations';
import { removeLink } from '$api/attached/link/operations';

export const DELETABLE_TYPES = ['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE', 'TODO', 'DOC', 'NOTE', 'LINK'] as const;
export type DeletableType = (typeof DELETABLE_TYPES)[number];

const DELETERS: Readonly<Record<DeletableType, (reg: Registry, id: string) => Promise<Result<unknown>>>> = {
  PERSON: deletePerson,
  GROUP: deleteGroup,
  PROJECT: deleteProject,
  GOAL: deleteGoal,
  PAGE: deletePage,
  TODO: deleteTodo,
  DOC: removeDoc,
  NOTE: removeNote,
  LINK: removeLink
};

/** The per-type procedure an entity type's writes belong to, for the module gate (goal.* in a home notebook). */
const ownPath = (entityType: string): string => `${entityType.toLowerCase()}.delete`;

export const entityRouter = router({
  // Archived: leaves lists and the home page, keeps its history, and it and what's
  // attached to it are read-only. archived: false unarchives.
  archive: procedure
    .meta({ description: 'Archives a person, group, project, goal or page (archived: false unarchives). It leaves lists and becomes read-only, keeping its history. Prefer this to deleting.' })
    .input(z.object({
      entityType: z.enum(ARCHIVABLE_TYPES),
      id: z.string(),
      archived: z.boolean().default(true)
    }))
    .mutation(({ ctx, input }) => {
      const owner = ctx.model.procedureOwner(ownPath(input.entityType));
      if (owner) return err(new Error(notInModelMessage(ctx.model, owner, input.entityType)));
      return setArchived(ctx.reg, input.entityType, input.id, input.archived);
    }),

  // Deletes for good, with everything attached to it (its notes, docs, todos, links,
  // tags and relations). Prefer archive for anything that may matter later.
  delete: procedure
    .meta({ description: 'Deletes a person, group, project, goal, page, todo, doc, note or link for good, with everything attached to it. Confirm with the user and take a backup_snapshot first.' })
    .input(z.object({ entityType: z.enum(DELETABLE_TYPES), id: z.string() }))
    .mutation(({ ctx, input }) => {
      const owner = ctx.model.procedureOwner(ownPath(input.entityType));
      if (owner) return err(new Error(notInModelMessage(ctx.model, owner, input.entityType)));
      return DELETERS[input.entityType](ctx.reg, input.id);
    })
});
