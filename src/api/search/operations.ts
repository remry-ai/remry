// Full-text search over the `search_index` FTS5 table. Triggers on the source
// tables keep it current (prisma/migrations/*_add_search_index), so nothing
// here writes to it.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { EntityType } from '$shared/types/enums';
import { SEARCH_TYPES, type SearchHit, type SearchResults, type SearchType } from '$shared/types/search';
import { docPath, entityPath } from '$shared/utils/entity';
import { features } from '$shared/settings/base/features';
import { resolveEntityLabel } from '$api/_entity-labels';
import { loadArchivedIds } from '$api/_archive';
import { summarizeContent } from '$api/home/operations';
import { buildFtsQuery } from './fts-query';

export const SEARCH_LIMITS = { query: 200, results: 50, defaultResults: 20 } as const;

/** A row of `search_index` as the query selects it. */
export interface IndexRow {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly parent_type: string | null;
  readonly parent_id: string | null;
  readonly title: string;
  readonly body_start: string;
  readonly snippet: string;
  readonly score: number;
}

// ----- Pure helpers -----

const parentOf = (row: IndexRow): { readonly entityType: EntityType; readonly entityId: string } | null =>
  row.parent_type && row.parent_id ? { entityType: row.parent_type as EntityType, entityId: row.parent_id } : null;

/** The route that shows a hit. Attachments open on their entity: a doc in its centre pane, a todo in its popup. */
export const hitPath = (row: IndexRow): string => {
  const type = row.entity_type as SearchType;
  const parent = parentOf(row);
  if (type === 'REPORT' || !parent) return entityPath(type === 'GOAL_CHECKIN' ? 'GOAL' : (type as EntityType), row.entity_id);
  if (type === 'DOC') return docPath(parent.entityType, parent.entityId, row.entity_id);
  const base = entityPath(parent.entityType, parent.entityId);
  return type === 'TODO' ? `${base}?popup=todo&todo=${row.entity_id}` : base;
};

/** A title, or the first line of the text for rows without one (notes, comments, check-ins, untitled links). */
export const hitName = (row: IndexRow): string =>
  row.title.trim() || summarizeContent(row.body_start) || '(empty)';

/** Types to search: the ones asked for (all by default), less reports while they're switched off. */
export const searchableTypes = (asked: readonly SearchType[] | undefined, reports = features.reports): readonly SearchType[] =>
  (asked && asked.length > 0 ? asked : SEARCH_TYPES).filter((t) => reports || t !== 'REPORT');

// ----- Queries -----

export interface IndexQuery {
  /** A MATCH expression from `buildFtsQuery` or `phraseQuery`, never raw input. */
  readonly match: string;
  readonly types: readonly SearchType[];
  /** Only the entity and what's attached to it. */
  readonly within?: { readonly entityType: EntityType; readonly entityId: string };
  /** Leave out these entities and everything attached to them. */
  readonly hiddenIds: readonly string[];
  readonly limit: number;
}

const SELECT = `
SELECT entity_type, entity_id, parent_type, parent_id, title,
       substr(body, 1, 400) AS body_start,
       snippet(search_index, -1, '**', '**', '…', 16) AS snippet,
       bm25(search_index, 0, 0, 0, 0, 10.0, 1.0) AS score
FROM search_index
WHERE search_index MATCH ?
  AND entity_type IN (SELECT value FROM json_each(?))
  AND entity_id NOT IN (SELECT value FROM json_each(?))
  AND (parent_id IS NULL OR parent_id NOT IN (SELECT value FROM json_each(?)))`;

/** Runs a query against the index and names each hit. Hits on an attachment whose entity is gone are left out. */
export const queryIndex = async (reg: Pick<Registry, 'prisma'>, query: IndexQuery): Promise<readonly SearchHit[]> => {
  if (query.types.length === 0) return [];
  const hidden = JSON.stringify(query.hiddenIds);
  const params: unknown[] = [query.match, JSON.stringify(query.types), hidden, hidden];
  let sql = SELECT;
  if (query.within) {
    sql += '\n  AND ((entity_type = ? AND entity_id = ?) OR (parent_type = ? AND parent_id = ?))';
    const { entityType, entityId } = query.within;
    params.push(entityType, entityId, entityType, entityId);
  }
  sql += '\nORDER BY score\nLIMIT ?';
  params.push(query.limit);

  const rows = await reg.prisma.$queryRawUnsafe<IndexRow[]>(sql, ...params);

  const parentKeys = [...new Set(rows.flatMap((r) => (r.parent_type && r.parent_id ? [`${r.parent_type}:${r.parent_id}`] : [])))];
  const labels = new Map(
    await Promise.all(
      parentKeys.map(async (key) => {
        const [type, id] = key.split(':') as [EntityType, string];
        return [key, await resolveEntityLabel(reg, type, id)] as const;
      })
    )
  );

  return rows.flatMap((row): SearchHit[] => {
    const parent = parentOf(row);
    const parentName = parent ? labels.get(`${parent.entityType}:${parent.entityId}`) ?? null : null;
    if (parent && parentName === null) return [];
    return [{
      entityType: row.entity_type as SearchType,
      entityId: row.entity_id,
      name: hitName(row),
      path: hitPath(row),
      on: parent && parentName !== null ? { ...parent, name: parentName } : null,
      snippet: row.snippet,
      score: Number(row.score)
    }];
  });
};

/** Ids of archived entities, which search leaves out with what's attached to them. */
export const archivedIdList = async (reg: Pick<Registry, 'prisma'>): Promise<readonly string[]> =>
  [...(await loadArchivedIds(reg)).values()].flat();

export interface SearchInput {
  readonly q: string;
  readonly types?: readonly SearchType[];
  readonly within?: { readonly entityType: EntityType; readonly entityId: string };
  readonly includeArchived?: boolean;
  readonly limit?: number;
}

export const searchNotebook = async (reg: Pick<Registry, 'prisma'>, input: SearchInput): Promise<Result<SearchResults>> => {
  const match = buildFtsQuery(input.q);
  if (!match.ok) return err(match.error);
  // Scoped to one entity, search shows what's there even if it's archived.
  const hiddenIds = input.includeArchived || input.within ? [] : await archivedIdList(reg);
  const results = await queryIndex(reg, {
    match: match.value,
    types: searchableTypes(input.types),
    within: input.within,
    hiddenIds,
    limit: input.limit ?? SEARCH_LIMITS.defaultResults
  });
  return ok({ query: input.q, results });
};
