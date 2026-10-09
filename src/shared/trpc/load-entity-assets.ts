// Reusable helper to load all polymorphic assets for an entity in parallel.
// Used by +page.server.ts load functions on entity detail pages.

import type { CreateTRPCClient } from '@trpc/client';
import type { AppRouter } from './router';

type Client = CreateTRPCClient<AppRouter>;

type UnwrapResult<T> = T extends { readonly ok: true; readonly value: infer V } ? V : never;
type QueryResult<T> = T extends (...args: readonly unknown[]) => Promise<infer R> ? R : never;

type DocItem = UnwrapResult<QueryResult<Client['doc']['list']['query']>> extends readonly (infer U)[] ? U : never;
type NoteItem = UnwrapResult<QueryResult<Client['note']['list']['query']>> extends readonly (infer U)[] ? U : never;
type CommentItem = UnwrapResult<QueryResult<Client['comment']['list']['query']>> extends readonly (infer U)[] ? U : never;
type LinkItem = UnwrapResult<QueryResult<Client['link']['list']['query']>> extends readonly (infer U)[] ? U : never;
type TagItem = UnwrapResult<QueryResult<Client['tag']['forEntity']['query']>> extends readonly (infer U)[] ? U : never;
type EmojiItem = UnwrapResult<QueryResult<Client['emoji']['list']['query']>> extends readonly (infer U)[] ? U : never;
type TodoItem = QueryResult<Client['todo']['forEntity']['query']> extends readonly (infer U)[] ? U : never;
type ReportItem = UnwrapResult<QueryResult<Client['report']['forEntity']['query']>> extends readonly (infer U)[] ? U : never;
type RelationGroupItem = UnwrapResult<QueryResult<Client['relation']['forEntity']['query']>> extends readonly (infer U)[] ? U : never;

export interface EntityAssets {
  readonly docs: readonly DocItem[];
  readonly notes: readonly NoteItem[];
  readonly comments: readonly CommentItem[];
  readonly links: readonly LinkItem[];
  readonly tags: readonly TagItem[];
  readonly emojis: readonly EmojiItem[];
  readonly todos: readonly TodoItem[];
  readonly reports: readonly ReportItem[];
  readonly relations: readonly RelationGroupItem[];
}

export const loadEntityAssets = async (
  client: Client,
  entityType: string,
  entityId: string
): Promise<EntityAssets> => {
  const input = { entityType: entityType as 'PROJECT', entityId };

  const [docs, notes, comments, links, tags, emojis, todos, reports, relations] = await Promise.all([
    client.doc.list.query(input),
    client.note.list.query(input),
    client.comment.list.query(input),
    client.link.list.query(input),
    client.tag.forEntity.query(input),
    client.emoji.list.query(input),
    client.todo.forEntity.query(input),
    client.report.forEntity.query(input),
    client.relation.forEntity.query(input),
  ]);

  return {
    docs: docs.ok ? docs.value : [],
    notes: notes.ok ? notes.value : [],
    comments: comments.ok ? comments.value : [],
    links: links.ok ? links.value : [],
    tags: tags.ok ? tags.value : [],
    emojis: emojis.ok ? emojis.value : [],
    todos,
    reports: reports.ok ? reports.value : [],
    relations: relations.ok ? relations.value : [],
  };
};
