// "Sync now" on a sync doc or sync wiki page, in the web app: the local Claude Code CLI reads
// each source (an outside link with the user's own connectors or web fetch, an uploaded file from
// its saved text or the file) and rewrites the text from the prompt; the app then saves it and
// marks each source it read as synced, with the source's own last-edited time. The runner comes
// from the HTTP tRPC context; the CLI and MCP have none, since there Claude syncs it itself.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { EntityType } from '$shared/types/enums';
import { ensureWritable } from '$api/_archive';
import { resolveEntityLabels } from '$api/_entity-labels';
import { parseSyncReply, syncPrompt, type SyncSource } from '$shared/assist/sync-cli';
import type { ConvertPdfResult } from '$shared/types/pdf-conversion';
import type { SyncNowStatus, SyncRunner } from '$shared/types/sync-now';
import { entityFileFolder, fileLinkKey } from '$shared/utils/file-links';
import { entityTypeLabel } from '$shared/utils/entity';
import { updateDoc } from '$api/attached/doc/operations';
import { updatePage } from '$api/page/operations';
import { markLinkSynced } from '$api/attached/link/operations';
import { readyLlm } from './llm';
import { recordSync, type SyncTarget } from '$api/_last-sync';

export const SYNC_RETRY = 'choose Sync now again, or ask Claude in a chat to sync it.';

type SyncReg = Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>;

export const syncJobKey = (notebookId: string, entityType: SyncTarget, id: string): string => `${notebookId}/SYNC:${entityType}:${id}`;

interface Target {
  readonly title: string;
  readonly content: string;
  readonly prompt: string;
  readonly on: string | null;
}

const loadTarget = async (reg: SyncReg, entityType: SyncTarget, id: string): Promise<Result<Target>> => {
  if (entityType === 'PAGE') {
    const page = await reg.prisma.page.findUnique({ where: { id }, select: { title: true, content: true, prompt: true, bodyType: true } });
    if (!page) return err(new Error('Page not found'));
    if (page.bodyType === 'sheet') return err(new Error("A spreadsheet page can't be synced."));
    if (page.bodyType === 'drawing') return err(new Error("A drawing page can't be synced."));
    if (!page.prompt?.trim()) return err(new Error('Only a sync page can be synced: give it a prompt first.'));
    return ok({ title: page.title, content: page.content, prompt: page.prompt, on: null });
  }
  const doc = await reg.prisma.doc.findUnique({ where: { id }, select: { title: true, content: true, prompt: true, bodyType: true, entityType: true, entityId: true } });
  if (!doc) return err(new Error('Doc not found'));
  if (doc.bodyType === 'sheet') return err(new Error("A spreadsheet doc can't be synced."));
  if (doc.bodyType === 'drawing') return err(new Error("A drawing doc can't be synced."));
  if (!doc.prompt?.trim()) return err(new Error('Only a sync doc can be synced: give it a prompt first.'));
  const parentType = doc.entityType as EntityType;
  const labels = await resolveEntityLabels(reg, [{ entityType: parentType, entityId: doc.entityId }]);
  const parent = labels.labelOf(parentType, doc.entityId);
  return ok({ title: doc.title, content: doc.content, prompt: doc.prompt, on: parent ? `the ${entityTypeLabel(parentType).toLowerCase()} ${parent}` : null });
};

/** Starts rewriting the doc or page from its sources in the background; poll `getSyncStatus`. */
export const startSyncNow = async (
  reg: SyncReg,
  runner: SyncRunner | undefined,
  notebookId: string,
  entityType: SyncTarget,
  id: string
): Promise<Result<ConvertPdfResult>> => {
  const target = await loadTarget(reg, entityType, id);
  if (!target.ok) return err(target.error);
  const writable = await ensureWritable(reg, entityType, id);
  if (!writable.ok) return err(writable.error);
  const links = await reg.prisma.link.findMany({ where: { entityType, entityId: id }, orderBy: { createdAt: 'asc' } });
  if (links.length === 0) return err(new Error('Add a source first: a link or a file, with "+ Add link".'));

  const llm = await readyLlm(runner, SYNC_RETRY);
  if (!llm.ready) return ok(llm.reply);

  const folder = entityFileFolder(entityType, id);
  const sources: SyncSource[] = links.map((l) => {
    const key = fileLinkKey(l.url);
    const own = key && folder && key.startsWith(`${folder}/`) ? key.slice(folder.length + 1) : null;
    return {
      id: l.id,
      title: l.title,
      url: key ? null : l.url,
      fileName: own,
      text: key ? l.text : null,
      sourceEditedAt: l.sourceEditedAt
    };
  });
  const titleOf = new Map(links.map((l) => [l.id, l.title ?? l.url]));

  const started = llm.runner.start({
    key: syncJobKey(notebookId, entityType, id),
    llm: llm.llm,
    urls: sources.flatMap((s) => (s.url ? [s.url] : [])),
    cwd: folder ? reg.storage.pathFor(folder) : null,
    prompt: syncPrompt({ kind: entityType === 'DOC' ? 'doc' : 'wiki page', ...target.value, sources }),
    onReply: async (reply) => {
      const parsed = parseSyncReply(reply, links.map((l) => l.id));
      if (!parsed.ok) return err(parsed.error);
      const saved = entityType === 'DOC'
        ? await updateDoc(reg, id, { content: parsed.value.markdown })
        : await updatePage(reg, id, { content: parsed.value.markdown });
      if (!saved.ok) return err(saved.error);
      for (const source of parsed.value.read) await markLinkSynced(reg, source.id, source.editedAt ?? undefined);
      if (parsed.value.unread.length === 0) return ok(null);
      return ok(`Synced, except: ${parsed.value.unread.map((u) => `${titleOf.get(u.id) ?? 'a source'} (${u.reason})`).join('; ')}.`);
    },
    onFinish: async (status) => {
      if (status.state === 'failed') await recordSync(reg, entityType, id, { by: 'APP', outcome: 'FAILED', message: status.message ?? 'Sync failed.' });
      else if (status.state === 'done') await recordSync(reg, entityType, id, { by: 'APP', outcome: status.message ? 'PARTIAL' : 'OK', message: status.message ?? null });
    }
  });
  return started.ok ? ok({ started: true }) : err(started.error);
};

export const getSyncStatus = (
  runner: SyncRunner | undefined,
  notebookId: string,
  entityType: SyncTarget,
  id: string
): Result<SyncNowStatus> => ok(runner ? runner.status(syncJobKey(notebookId, entityType, id)) : { state: 'idle' });
