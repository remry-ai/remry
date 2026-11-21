// "Sync now" on an entity's sync doc or a sync wiki page, in the web app: the local Claude Code
// CLI reads each of the entity's sources (an outside link with the user's own connectors or web fetch, an uploaded file from
// its saved text or the file) and rewrites the text from the prompt; the app then saves it and
// marks each source it read as synced, with the source's own last-edited time. The runner comes
// from the HTTP tRPC context; the CLI and MCP have none, since there Claude syncs it itself.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { resolveEntityLabels } from '$api/_entity-labels';
import { NO_SOURCES_BLOCK, readSyncReply, syncPrompt, type SyncSource } from '$shared/assist/sync-cli';
import { syncReportNote } from '$shared/assist/sync-report';
import { llmProvider } from '$shared/assist/providers/registry';
import type { ConvertPdfResult } from '$shared/types/pdf-conversion';
import type { SyncConnectors, SyncNowStatus, SyncRunner } from '$shared/types/sync-now';
import { entityFileFolder, fileLinkKey } from '$shared/utils/file-links';
import { entityTypeLabel } from '$shared/utils/entity';
import { requireDocument } from '$api/_body';
import { saveSyncText } from '$api/attached/sync/operations';
import { readyLlm } from './llm';
import { findSyncTarget, recordSync } from '$api/_last-sync';
import type { SyncHolderRef } from '$shared/utils/sync-state';

/** The assistant named as the program on this computer ("Claude Code"), apart from Claude in Cowork or the desktop app. */
const assistantOnComputer = (provider: Parameters<typeof llmProvider>[0]): string => llmProvider(provider).product.replace(/ CLI$/, '');

export const SYNC_RETRY = 'choose Sync now again, or ask Claude in a chat to sync it.';

type SyncReg = Pick<Registry, 'prisma' | 'storage' | 'logger' | 'now' | 'uuid'>;

/** One job per synced entity. */
export const syncJobKey = (notebookId: string, holder: SyncHolderRef): string => `${notebookId}/SYNC:${holder.entityType}:${holder.entityId}`;

interface Target {
  readonly title: string;
  readonly content: string;
  readonly prompt: string;
  readonly on: string | null;
}

const NOT_SYNCED = 'Only a synced entity can be synced: give it a prompt first.';

const loadTarget = async (reg: SyncReg, holder: SyncHolderRef): Promise<Result<Target & { readonly kind: 'DOC' | 'PAGE'; readonly id: string }>> => {
  const target = await findSyncTarget(reg, holder);
  if (!target) return err(new Error(NOT_SYNCED));
  if (target.entityType === 'PAGE') {
    const page = await reg.prisma.page.findUnique({ where: { id: target.id }, select: { title: true, content: true, prompt: true, bodyType: true } });
    if (!page) return err(new Error('Page not found'));
    const document = requireDocument('page', page.bodyType, 'synced');
    if (!document.ok) return err(document.error);
    if (!page.prompt?.trim()) return err(new Error(NOT_SYNCED));
    return ok({ kind: 'PAGE', id: target.id, title: page.title, content: page.content, prompt: page.prompt, on: null });
  }
  const doc = await reg.prisma.doc.findUnique({ where: { id: target.id }, select: { title: true, content: true, prompt: true, bodyType: true } });
  if (!doc) return err(new Error('Doc not found'));
  const document = requireDocument('doc', doc.bodyType, 'synced');
  if (!document.ok) return err(document.error);
  if (!doc.prompt?.trim()) return err(new Error(NOT_SYNCED));
  const labels = await resolveEntityLabels(reg, [{ entityType: holder.entityType, entityId: holder.entityId }]);
  const parent = labels.labelOf(holder.entityType, holder.entityId);
  return ok({ kind: 'DOC', id: target.id, title: doc.title, content: doc.content, prompt: doc.prompt, on: parent ? `the ${entityTypeLabel(holder.entityType).toLowerCase()} ${parent}` : null });
};

/** Starts rewriting the entity's sync doc or page from its sources in the background; poll `getSyncStatus`. */
export const startSyncNow = async (
  reg: SyncReg,
  runner: SyncRunner | undefined,
  notebookId: string,
  holder: SyncHolderRef
): Promise<Result<ConvertPdfResult>> => {
  const target = await loadTarget(reg, holder);
  if (!target.ok) return err(target.error);
  const writable = await ensureWritable(reg, holder.entityType, holder.entityId);
  if (!writable.ok) return err(writable.error);
  const links = await reg.prisma.link.findMany({ where: { entityType: holder.entityType, entityId: holder.entityId, syncSource: true }, orderBy: { createdAt: 'asc' } });
  if (links.length === 0) return err(new Error('Choose a source first: add a link or a file as a source, or mark one of its links as a source.'));
  const { kind, id } = target.value;

  const llm = await readyLlm(runner, SYNC_RETRY);
  if (!llm.ready) return ok(llm.reply);

  // Files uploaded as sources live in the entity's folder, where the run starts.
  const folder = entityFileFolder(holder.entityType, holder.entityId);
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
  const assistant = assistantOnComputer(llm.llm.provider);
  const reportSources = sources.map((s) => ({ id: s.id, title: s.title, url: s.url }));

  const started = llm.runner.start({
    key: syncJobKey(notebookId, holder),
    llm: llm.llm,
    urls: sources.flatMap((s) => (s.url ? [s.url] : [])),
    cwd: folder ? reg.storage.pathFor(folder) : null,
    prompt: syncPrompt({ kind: kind === 'DOC' ? 'doc' : 'wiki page', title: target.value.title, content: target.value.content, prompt: target.value.prompt, on: target.value.on, sources }),
    onReply: async (reply, run) => {
      const parsed = readSyncReply(reply, links.map((l) => l.id));
      if (!parsed) return err(new Error(NO_SOURCES_BLOCK));
      // Which sources it couldn't read, why, and what to do: kept as the last sync's message.
      const note = syncReportNote({ assistant, servers: run.servers, sources: reportSources, read: parsed.read.map((r) => r.id), unread: parsed.unread });
      if (parsed.read.length === 0) return err(new Error(note ?? `${assistant} couldn't read any of the sources, so nothing was changed.`));
      if (parsed.markdown === '') return err(new Error(`${assistant} returned no text, so nothing was changed.`));
      const saved = await saveSyncText(reg, holder, parsed.markdown, parsed.read.map((r) => ({ id: r.id, editedAt: r.editedAt ?? undefined })));
      if (!saved.ok) return err(saved.error);
      return ok(note);
    },
    onFinish: async (status) => {
      if (status.state === 'failed') await recordSync(reg, kind, id, { by: 'APP', outcome: 'FAILED', message: status.message ?? 'Sync failed.' });
      else if (status.state === 'done') await recordSync(reg, kind, id, { by: 'APP', outcome: status.message ? 'PARTIAL' : 'OK', message: status.message ?? null });
    }
  });
  return started.ok ? ok({ started: true }) : err(started.error);
};

export const getSyncStatus = (
  runner: SyncRunner | undefined,
  notebookId: string,
  holder: SyncHolderRef
): Result<SyncNowStatus> => ok(runner ? runner.status(syncJobKey(notebookId, holder)) : { state: 'idle' });

/**
 * The assistant Sync now would run and the connectors it has, for the banner to say before a
 * sync which sources it can only open as public pages.
 */
export const getSyncConnectors = async (runner: SyncRunner | undefined): Promise<Result<SyncConnectors>> => {
  const llm = await readyLlm(runner, SYNC_RETRY);
  if (!llm.ready) return ok({ ready: false, warning: llm.reply.warning });
  return ok({ ready: true, assistant: assistantOnComputer(llm.llm.provider), servers: await llm.runner.connectors(llm.llm) });
};
