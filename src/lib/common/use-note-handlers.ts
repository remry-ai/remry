import { invalidateAll } from '$app/navigation';
import { submitOrThrow } from '$lib/ui/submit';

// Handlers throw the API's error message; NoteEditor and NotesList's
// ConfirmButton catch and show it.

interface NoteTrpc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add: { mutate: (input: any) => Promise<unknown> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: { mutate: (input: any) => Promise<unknown> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remove: { mutate: (input: any) => Promise<unknown> };
}

export interface NoteHandlers {
  readonly handleAddNote: (content: string, parentId?: string) => Promise<void>;
  readonly handleUpdateNote: (id: string, content: string) => Promise<void>;
  readonly handleRemoveNote: (id: string) => Promise<void>;
}

export const createNoteHandlers = (
  noteTrpc: NoteTrpc,
  entityType: string,
  entityId: string,
): NoteHandlers => ({
  handleAddNote: async (content: string, parentId?: string) => {
    await submitOrThrow(() => noteTrpc.add.mutate({ entityType, entityId, parentId, content }));
    await invalidateAll();
  },

  handleUpdateNote: async (id: string, content: string) => {
    await submitOrThrow(() => noteTrpc.update.mutate({ id, content }));
    await invalidateAll();
  },

  handleRemoveNote: async (id: string) => {
    await submitOrThrow(() => noteTrpc.remove.mutate({ id }));
    await invalidateAll();
  },
});
