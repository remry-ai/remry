<script lang="ts">
  // The banner on an entity's sync doc or a sync wiki page: it says so, shows the prompt
  // (what Claude pulls from each source when it refreshes the text below) and the
  // sources (the entity's links marked as sources). The text itself is read-only: only a
  // sync writes it. The prompt is editable here; clearing it makes an ordinary doc or page.
  // `creating` opens it on an empty prompt, for "Sync doc…"; Cancel leaves it as it was.
  // "Sync now" (with onSyncNow) has the local Claude read the sources and rewrite the text now.
  // Under the prompt, a line says when it was last synced, by what, and how it went (`lastSync`);
  // with `target`, a sync still running when the page opens shows as running until it ends.
  import ProIcon from '$lib/ui/ProIcon.svelte';
  import { assistantName } from '$lib/stores/assistant';
  import { syncStatus, type LastSyncView } from '../last-sync';
  import SyncStatus from './SyncStatus.svelte';
  import ProLock from '$lib/ui/ProLock.svelte';
  import { page as appPage } from '$app/state';
  import { isProActive, lockedMessage, NO_LICENSE, type LicenseStatus } from '$shared/types/license';
  import { syncRunning, waitForSync } from '../sync-now';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import Field from '$lib/ui/Field.svelte';
  import { errorMessage, submit } from '$lib/ui/submit';
  import type { SyncNowOutcome } from '../sync-now';
  import SourceLinks from './SourceLinks.svelte';
  import type { SyncHolderRef } from '$shared/utils/sync-state';
  import { trpc } from '$shared/trpc/client';
  import { fileLinkKey } from '$shared/utils/file-links';
  import { connectorReach } from '$shared/assist/sync-report';
  import type { ConnectorProbe } from '$shared/types/sync-now';
  import { onDestroy } from 'svelte';
  import { timeAgo } from '$lib/home/utils';

  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
  }

  interface Props {
    readonly prompt: string;
    readonly links: readonly LinkItem[];
    /** Saves the prompt; null clears it. Without it, the prompt is read-only. */
    readonly onSave?: (prompt: string | null) => Promise<unknown>;
    /** Adds a source (SourceLinks' Add link). */
    readonly onAddLink?: (link: { readonly url: string; readonly title?: string }) => Promise<unknown>;
    /** Uploads a file as a source link, from the same form (SourceLinks' onUploadFile). */
    readonly onUploadFile?: (file: File) => Promise<unknown>;
    /** Making a doc a sync doc: opens on the prompt box, and Cancel calls `onCancel`. */
    readonly creating?: boolean;
    readonly onCancel?: () => void;
    /** Nothing written yet: say that Claude writes it. */
    readonly empty?: boolean;
    /** Rewrites the text from the sources now, with the local Claude (`syncNowAndWait`); resolves once it's saved. */
    readonly onSyncNow?: () => Promise<SyncNowOutcome | null>;
    /** Its last sync (doc.get, page.get, doc.list); null when never synced. */
    readonly lastSync?: LastSyncView | null;
    /** The synced entity, to pick up a sync that's already running when the page opens. */
    readonly target?: SyncHolderRef;
    /** What it is, in the prompt box's words: "doc" or "page". */
    readonly noun?: 'doc' | 'page';
    /** The "Sync" badge at its start; SyncSection's heading says it instead. */
    readonly badge?: boolean;
    /** Shown (SyncSection open): only then does it ask which connectors the assistant has, which takes a few seconds. */
    readonly active?: boolean;
    /** When the user asked Claude to sync it, still waiting; null when not. */
    readonly requestedAt?: Date | string | null;
    /** "Ask Claude to sync" (true) or taking the request back (false): the next Claude chat that uses Remry syncs it with its connectors. */
    readonly onRequest?: (requested: boolean) => Promise<unknown>;
    /** Reloads the page's data once that sync ends (onSyncNow does its own). */
    readonly onRefresh?: () => Promise<unknown>;
  }

  const { prompt, links, onSave, onAddLink, onUploadFile, creating = false, onCancel, empty = false, onSyncNow, lastSync = null, target, noun = 'doc', badge = true, active = true, requestedAt = null, onRequest, onRefresh }: Props = $props();

  // Shown once it has sources: a dot and when, with the details in the tooltip.
  // Making a sync doc (its first prompt) is Remry Pro: without it, "Sync doc…" or "Make sync page" shows why instead of the prompt box.
  // An existing sync doc's prompt stays editable.
  const license = $derived((appPage.data?.license as LicenseStatus | undefined) ?? NO_LICENSE);
  const creatingLocked = $derived(creating && !isProActive(license));
  const PROMPT_EXAMPLE = 'PRD: scope and launch plan. Linear: status and dates. Flag any disagreement.';

  const status = $derived(links.length > 0 || lastSync ? syncStatus(lastSync) : null);

  // svelte-ignore state_referenced_locally
  let editing = $state(creating);
  let draft = $state('');
  let saving = $state(false);
  let error = $state('');

  let syncing = $state(false);
  let syncNotice = $state<{ readonly tone: 'warning' | 'error' | 'done'; readonly message: string } | null>(null);
  // The last sync's time when the notice was set: once a newer last sync is loaded, its line says
  // the same thing (it ran, failed, or skipped a source), so the notice gives way to it.
  let noticeFor = $state<string | null>(null);
  const showNotice = $derived(syncNotice !== null && noticeFor === String(lastSync?.at ?? null));

  // ----- What the assistant on this computer can read -----
  // Sync now runs the assistant installed here (Claude Code), with only its own connectors
  // (`claude mcp list`), not the claude.ai ones Cowork and Claude desktop use. So before a sync,
  // say which sources it has no connector for: it can open those only as public pages.
  type ReachState =
    | { readonly state: 'loading' }
    | { readonly state: 'ready'; readonly assistant: string; readonly probe: ConnectorProbe | null }
    | { readonly state: 'unavailable'; readonly warning: string };
  let reach = $state<ReachState | null>(null);
  const outsideLinks = $derived(links.filter((l) => fileLinkKey(l.url) === null));
  $effect(() => {
    if (!active || !onSyncNow || outsideLinks.length === 0 || reach) return;
    reach = { state: 'loading' };
    void trpc().sync.connectors.query().then((result) => {
      if (!result.ok) { reach = null; return; }
      const value = result.value;
      reach = value.ready ? { state: 'ready', assistant: value.assistant, probe: value.probe } : { state: 'unavailable', warning: value.warning };
    }).catch(() => { reach = null; });
  });
  /** The sources Sync now can open only if public, why, and what to do. */
  const gaps = $derived(reach?.state === 'ready' ? connectorReach(reach.assistant, reach.probe, outsideLinks) : null);
  const assistantHere = $derived(reach?.state === 'ready' ? reach.assistant : `${$assistantName} on this computer`);

  // ----- Asking Claude (with the user's connectors) to sync it -----
  let requesting = $state(false);
  let requestError = $state('');
  const request = async (requested: boolean) => {
    if (!onRequest) return;
    requesting = true;
    requestError = '';
    const outcome = await submit(() => onRequest(requested));
    requesting = false;
    if (!outcome.ok) requestError = outcome.error;
  };
  const requestedWhen = $derived(requestedAt ? timeAgo(new Date(requestedAt)) : null);

  // ----- Running -----
  let elapsed = $state(0);
  let ticker: ReturnType<typeof setInterval> | null = null;
  const stopTicker = () => { if (ticker) clearInterval(ticker); ticker = null; };
  onDestroy(stopTicker);
  const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  // The last sync's report (sources it couldn't read, and what to do), kept until the next sync.
  const lastReport = $derived(lastSync && lastSync.outcome !== 'OK' && lastSync.message ? { tone: lastSync.outcome === 'FAILED' ? 'error' : 'warning', message: lastSync.message } : null);

  const runSync = async (sync: () => Promise<SyncNowOutcome | null>) => {
    const before = String(lastSync?.at ?? null);
    elapsed = 0;
    stopTicker();
    ticker = setInterval(() => { elapsed += 1; }, 1000);
    syncing = true;
    syncNotice = null;
    try {
      syncNotice = await sync();
    } catch (e: unknown) {
      syncNotice = { tone: 'error', message: errorMessage(e) };
    } finally {
      noticeFor = before;
      syncing = false;
      stopTicker();
    }
  };

  const syncNow = async () => {
    if (onSyncNow) await runSync(onSyncNow);
  };

  // A sync started before the page opened (from another tab, or before a reload) still shows as running.
  $effect(() => {
    if (!target || !onSyncNow) return;
    const holder = { entityType: target.entityType, entityId: target.entityId };
    let live = true;
    void syncRunning(holder).then((running) => {
      if (!running || !live || syncing) return;
      void runSync(async () => {
        try {
          return await waitForSync(holder);
        } finally {
          await onRefresh?.();
        }
      });
    }).catch(() => undefined);
    return () => { live = false; };
  });

  const startEditing = () => { draft = prompt; error = ''; editing = true; };

  const cancel = () => {
    editing = false;
    if (creating) onCancel?.();
  };

  const save = async () => {
    if (!onSave) return;
    // A new one with no prompt is just a cancel.
    if (creating && !draft.trim()) { cancel(); return; }
    saving = true;
    const outcome = await submit(() => onSave(draft.trim() || null));
    saving = false;
    if (!outcome.ok) { error = outcome.error; return; }
    editing = false;
  };
</script>

<section class="sync-doc" aria-label="Sync prompt">
  <div class="head">
    {#if badge}<span class="badge accent" title="Claude rewrites this from its sources, following the prompt. Only a sync changes the text.">Sync</span>{/if}
    {#if creating}<span class="text-xs text-2">Say what Claude should take from each source; add the sources below, or mark links as sources.</span>
    {:else if syncing}<span class="text-xs text-2" aria-live="polite">{assistantHere} is reading {links.length} source{links.length === 1 ? '' : 's'} and rewriting this… {clock(elapsed)}</span>
    {:else if empty && !lastSync}<span class="text-xs text-2">Nothing written yet: choose Sync now, or ask Claude to write it.</span>
    {:else if status}<SyncStatus {...status} />{/if}
    {#if onRequest && !editing && !creating}
      {#if requestedAt}
        <span class="badge accent ml-auto" title="Waiting for the next Claude chat that uses Remry">Requested {requestedWhen}</span>
        <button type="button" class="btn ghost sm" onclick={() => request(false)} disabled={requesting}>Cancel request</button>
      {:else}
        <button type="button" class="btn sm ml-auto" onclick={() => request(true)} disabled={requesting || syncing || links.length === 0} aria-busy={requesting} title={links.length === 0 ? 'Add a source first, or mark one of its links as a source' : 'The next Claude chat that uses Remry (Cowork, Claude desktop) syncs it, reading the sources with your claude.ai connectors'}>Ask Claude to sync</button>
      {/if}
    {/if}
    {#if onSyncNow && !editing && !creating}
      <button type="button" class="btn sm" class:ghost={!!onRequest} class:ml-auto={!onRequest} onclick={syncNow} disabled={syncing || links.length === 0} aria-busy={syncing} title={links.length === 0 ? 'Add a source first, or mark one of its links as a source' : `${assistantHere} reads each source now, with only the connectors it has here, and rewrites the text from the prompt`}>{syncing ? 'Syncing…' : 'Sync now'}{#if !syncing}<ProIcon />{/if}</button>
    {/if}
    {#if onSave && !editing}
      <button type="button" class="btn icon sm" class:ml-auto={!onSyncNow && !onRequest} aria-label="Edit the prompt" title="Edit the prompt" onclick={startEditing}><PencilIcon /></button>
    {/if}
  </div>

  {#if creatingLocked}
    <!-- What a sync doc is, as the prompt box would say, so the lock isn't the only explanation. -->
    <p class="text-sm text-2 explain">A sync {noun} is rewritten by Claude from its sources, following a prompt you write. For example: <em>{PROMPT_EXAMPLE}</em></p>
    <ProLock title="Sync docs" message={lockedMessage('sync', license, 'app')} compact>
      <button type="button" class="btn ghost sm" onclick={cancel}>Cancel</button>
    </ProLock>
  {:else if editing}
    <form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); void save(); }}>
      <Field label="Prompt" hint={creating ? `For example: ${PROMPT_EXAMPLE}` : `Empty makes it an ordinary ${noun} you can edit`}>
        {#snippet children({ id })}
          <!-- svelte-ignore a11y_autofocus -->
          <textarea {id} rows="3" maxlength="2000" bind:value={draft} autofocus={creating}></textarea>
        {/snippet}
      </Field>
      {#if error}<p class="form-error">{error}</p>{/if}
      <div class="form-actions">
        <button type="submit" class="btn primary sm" disabled={saving} aria-busy={saving}>{saving ? 'Saving…' : creating ? `Make sync ${noun}` : 'Save'}</button>
        <button type="button" class="btn ghost sm" onclick={cancel}>Cancel</button>
      </div>
    </form>
  {:else}
    <p class="prompt pre-line"><span class="label">Prompt</span> {prompt}</p>
  {/if}

  {#if requestedAt && !creating}
    <p class="text-xs text-2 report">Waiting for Claude: the next chat that uses Remry (Cowork, Claude desktop) syncs this with your connectors. Open one and say hi, or ask it to sync this.</p>
  {/if}
  {#if requestError}<p class="form-error">{requestError}</p>{/if}

  {#if syncNotice && showNotice}
    <p class="text-xs pre-line report" class:form-error={syncNotice.tone === 'error'} class:warning={syncNotice.tone === 'warning'} role="status">{syncNotice.message}</p>
  {:else if lastReport && !syncing}
    <p class="text-xs pre-line report" class:form-error={lastReport.tone === 'error'} class:warning={lastReport.tone === 'warning'}>{lastReport.message}</p>
  {/if}

  {#if links.length > 0 || onAddLink || onUploadFile}<SourceLinks {links} onAdd={onAddLink} {onUploadFile} />{/if}

  <!-- What Sync now can't reach; not once Claude has been asked, which is what the advice ends with. -->
  {#if onSyncNow && !creating && !requestedAt}
    {#if reach?.state === 'loading'}
      <p class="text-xs text-2 reach">Checking which connectors {$assistantName} on this computer has…</p>
    {:else if reach?.state === 'unavailable'}
      <p class="text-xs warning reach">{reach.warning}</p>
    {:else if reach?.state === 'ready' && gaps && gaps.unreachable.length > 0}
      <p class="text-xs warning reach pre-line">{reach.assistant} on this computer can open {gaps.unreachable.map((n) => `“${n}”`).join(', ')} only if public.
{gaps.advice.join('\n')}</p>
    {/if}
  {/if}
</section>

<style lang="scss">
  .sync-doc {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    // No fill: a rule down the left edge marks it, so it reads as the doc's header, not a callout.
    padding: var(--sp-1) 0 var(--sp-1) var(--sp-3);
    border-left: 2px solid var(--accent);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .prompt {
    margin: 0;
    font-size: var(--fs-sm);
  }
  .label {
    font-weight: 600;
  }
  .warning { color: var(--warning); margin: 0; }
  .report, .reach { margin: 0; }
  .explain { margin: 0; }
</style>
