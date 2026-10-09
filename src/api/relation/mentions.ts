// MENTIONS relations, derived from app links in markdown content. Docs, notes,
// reports and pages call syncMentions whenever their content is saved.

import type { Registry } from '$shared/registry';
import { RELATABLE_TYPES, type RelatableType } from '$shared/types/enums';
import { extractEntityLinks } from '$shared/utils/mentions';
import { resolveEntityLabel } from '$api/_entity-labels';

const RELATABLE: ReadonlySet<string> = new Set(RELATABLE_TYPES);

/** Replaces the MENTIONS relations from `source` with one per existing entity its content links to. */
export const syncMentions = async (
  reg: Pick<Registry, 'prisma'>,
  source: { readonly entityType: RelatableType; readonly entityId: string },
  content: string
): Promise<void> => {
  const candidates = extractEntityLinks(content).filter(
    (ref) => RELATABLE.has(ref.entityType) && !(ref.entityType === source.entityType && ref.entityId === source.entityId)
  );
  const labels = await Promise.all(candidates.map((ref) => resolveEntityLabel(reg, ref.entityType, ref.entityId)));
  const targets = candidates.filter((_, i) => labels[i] !== null);

  const from = { fromType: source.entityType, fromId: source.entityId };
  const clear = reg.prisma.relation.deleteMany({ where: { ...from, kind: 'MENTIONS' } });
  if (targets.length === 0) {
    await clear;
    return;
  }
  await reg.prisma.$transaction([
    clear,
    ...targets.map((ref) =>
      reg.prisma.relation.create({ data: { ...from, toType: ref.entityType, toId: ref.entityId, kind: 'MENTIONS' } })
    )
  ]);
};
