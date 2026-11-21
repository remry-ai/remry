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
  import { onDestroy } from 'svelte';
  import { timeAgo } from '$lib/home/utils';
  import Popup from '$lib/common/Popup.svelte';
  import { openPopup } from '$lib/ui/popup-url';
  import SyncStatus from './SyncStatus.svelte';

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
    /** When the user asked Claude to sync it, still waiting; null when not. */
    readonly requestedAt?: Date | string | null;
    /** "Trigger sync" (true) or taking it back (false): the next Claude chat that uses Remry syncs it with its connectors. */
    readonly onRequest?: (requested: boolean) => Promise<unknown>;
    /** Dismisses the last sync's error (its message; the dot stays red until a sync runs). */
    readonly onClearError?: () => Promise<unknown>;
    /** Reloads the page's data once that sync ends (onSyncNow does its own). */
    readonly onRefresh?: () => Promise<unknown>;
  }

  const { prompt, links, onSave, onAddLink, onUploadFile, creating = false, onCancel, empty = false, onSyncNow, lastSync = null, target, noun = 'doc', badge = true, requestedAt = null, onRequest, onClearError, onRefresh }: Props = $props();

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

  const assistantHere = $derived(`${$assistantName} on this computer`);

  // "Sync now" (the assistant on this computer) is hidden for now: it reads only with the connectors
  // that loads, which seldom include the user's claude.ai ones. "Trigger sync" has a Claude chat
  // with those connectors do it. The code stays, and a sync already running still shows.
  const SYNC_NOW_SHOWN = false;

  const SYNC_HELP_POPUP = 'sync-help';

  // ----- Triggering a sync, by Claude with the user's connectors -----
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

  // Only an error shows, in one line (its first), with the whole story in the tooltip, until
  // dismissed: this run's, else the last sync's if it failed. A partial sync's note is only in
  // the status's tooltip.
  const failure = $derived.by((): string | null => {
    if (syncNotice && showNotice) return syncNotice.tone === 'done' ? null : syncNotice.message;
    return !syncing && lastSync?.outcome === 'FAILED' && lastSync.message ? lastSync.message : null;
  });
  const conciseError = (message: string): string =>
    (message.split('\n')[0] ?? message).replace(/,? so nothing was changed\.?$/i, '.').trim();
  const dismissError = async () => {
    syncNotice = null;
    if (lastSync?.outcome === 'FAILED' && lastSync.message) await submit(async () => onClearError?.());
  };

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
      <button type="button" class="btn ghost sm ml-auto" onclick={() => openPopup(SYNC_HELP_POPUP)}>How it works</button>
      {#if requestedAt}
        <span class="badge accent" title="Waiting for the next Claude chat that uses Remry (Cowork, Claude desktop), which syncs it with your connectors">Sync triggered {requestedWhen}</span>
        <button type="button" class="btn ghost sm" onclick={() => request(false)} disabled={requesting}>Cancel</button>
      {:else}
        <button type="button" class="btn sm" onclick={() => request(true)} disabled={requesting || syncing || links.length === 0} aria-busy={requesting} title={links.length === 0 ? 'Add a source first, or mark one of its links as a source' : 'The next Claude chat that uses Remry (Cowork, Claude desktop) syncs it, reading the sources with your claude.ai connectors'}>Trigger sync</button>
      {/if}
    {/if}
    {#if onSyncNow && SYNC_NOW_SHOWN && !editing && !creating}
      <button type="button" class="btn sm" class:ghost={!!onRequest} class:ml-auto={!onRequest} onclick={syncNow} disabled={syncing || links.length === 0} aria-busy={syncing} title={links.length === 0 ? 'Add a source first, or mark one of its links as a source' : `${assistantHere} reads each source now, with only the connectors it has here, and rewrites the text from the prompt`}>{syncing ? 'Syncing…' : 'Sync now'}{#if !syncing}<ProIcon />{/if}</button>
    {/if}
    {#if onSave && !editing}
      <button type="button" class="btn icon sm" class:ml-auto={!(onSyncNow && SYNC_NOW_SHOWN) && !onRequest} aria-label="Edit the prompt" title="Edit the prompt" onclick={startEditing}><PencilIcon /></button>
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

  {#if requestError}<p class="form-error">{requestError}</p>{/if}

  {#if failure}
    <p class="form-error error-line" role="alert" title={failure}>
      <span>{conciseError(failure)}</span>
      <button type="button" class="dismiss" aria-label="Dismiss" title="Dismiss" onclick={dismissError}>×</button>
    </p>
  {/if}

  {#if links.length > 0 || onAddLink || onUploadFile}<SourceLinks {links} onAdd={onAddLink} {onUploadFile} />{/if}

</section>

<Popup id={SYNC_HELP_POPUP} title="How sync docs work">
  <div class="help">
    <p>A sync {noun} is a write-up Claude keeps in step with its sources, following the prompt. Claude writes it; you steer it.</p>
    <ul>
      <li><strong>The prompt</strong> says what to take from each source and what to watch for, for example: <em>PRD: scope and launch plan. Linear: status and dates. Flag any disagreement.</em> Edit it with the pencil.</li>
      <li><strong>The sources</strong> are this page's links marked with the sync icon in the sidebar's Links. Click a link's icon to make it a source or not; add a link or upload a file here to add one.</li>
      <li><strong>Trigger sync</strong> asks Claude to sync it. The next Claude chat that uses Remry (Cowork, Claude desktop or Claude Code) reads the sources with your connectors and rewrites it. You can also just ask Claude in a chat to sync it.</li>
      <li><strong>Discrepancies</strong>: where sources disagree, Claude lists each side at the end rather than picking one, and never changes your own fields to match.</li>
      <li><strong>Only Claude writes it.</strong> To edit it by hand, clear the prompt: it becomes an ordinary {noun}.</li>
    </ul>
    <p class="status-key">
      <span><SyncStatus tone="ok" text="Synced" title="Synced and current" /></span>
      <span><SyncStatus tone="warning" text="Due a sync" title="Never synced, or over a week ago" /></span>
      <span><SyncStatus tone="error" text="Last sync failed" title="The last sync failed" /></span>
    </p>
  </div>
</Popup>

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
  // The error's callout, with its × inside at the right.
  .error-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    padding-block: var(--sp-1);
    span { flex: 1; }
  }
  .dismiss {
    padding: 0 var(--sp-1);
    border: 0;
    background: none;
    color: inherit;
    font-size: var(--fs-md);
    line-height: 1;
    cursor: pointer;
    opacity: 0.7;
    &:hover { opacity: 1; }
    &:focus-visible { box-shadow: var(--focus); border-radius: var(--r-sm); }
  }
  .explain { margin: 0; }
  .help {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    font-size: var(--fs-sm);
    p, ul { margin: 0; }
    ul { display: flex; flex-direction: column; gap: var(--sp-2); padding-left: var(--sp-4); }
  }
  .status-key { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
</style>
