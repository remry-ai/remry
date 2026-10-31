// Test helper: the Prisma models planEntityCleanup reads and writes, over in-memory
// rows. findMany answers the cleanup's queries (attached to any of several entities,
// or replies to notes); deleteMany and updateMany are spies; $transaction runs them.

import { vi } from 'vitest';

export interface AttachedRow {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly parentId?: string | null;
}

type Model = 'doc' | 'note' | 'todo' | 'link' | 'comment';

// The cleanup asks for one type and a batch of its ids at a time, or for replies to notes.
interface AttachedWhere {
  readonly entityType?: string;
  readonly entityId?: { readonly in: readonly string[] };
  readonly parentId?: { readonly in: readonly string[] };
}

const matches = (row: AttachedRow, where: AttachedWhere): boolean =>
  (where.entityType === row.entityType && (where.entityId?.in.includes(row.entityId) ?? false)) ||
  (where.parentId?.in.includes(row.parentId ?? '') ?? false);

const model = (rows: readonly AttachedRow[]) => ({
  findMany: vi.fn(async ({ where }: { where: AttachedWhere }) => rows.filter((r) => matches(r, where))),
  deleteMany: vi.fn(async () => ({ count: 0 })),
  updateMany: vi.fn(async () => ({ count: 0 }))
});

/** A prisma mock for planEntityCleanup, with these attached rows, plus any extra models. */
export const cleanupPrisma = (rows: Partial<Record<Model, readonly AttachedRow[]>> = {}, extra: Record<string, unknown> = {}) => ({
  doc: model(rows.doc ?? []),
  note: model(rows.note ?? []),
  todo: model(rows.todo ?? []),
  link: model(rows.link ?? []),
  comment: model(rows.comment ?? []),
  tagAttachment: model([]),
  emoji: model([]),
  pageChat: model([]),
  relation: model([]),
  goal: model([]),
  project: model([]),
  $transaction: vi.fn(async (ops: readonly Promise<unknown>[]) => Promise.all(ops)),
  ...extra
});
