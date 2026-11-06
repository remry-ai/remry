<script lang="ts">
  // The banner on a sync doc or sync wiki page: it says so, shows the prompt
  // (what Claude pulls from each source when it refreshes the text below) and
  // the sources. The prompt is editable here; clearing it makes an ordinary doc.
  // `creating` opens it on an empty prompt, for "Make sync doc"; Cancel leaves it as it was.
  // "Sync now" (with onSyncNow) has the local Claude read the sources and rewrite the text now.
  // Under the prompt, a line says when it was last synced, by what, and how it went (`lastSync`);
  // with `target`, a sync still running when the page opens shows as running until it ends.
  import { assistantName } from '$lib/stores/assistant';
  import { lastSyncLine, type LastSyncView } from '../last-sync';
  import { syncRunning, waitForSync } from '../sync-now';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import Field from '$lib/ui/Field.svelte';
  import { errorMessage, submit } from '$lib/ui/submit';
  import type { SyncNowOutcome } from '../sync-now';
  import SourceLinks from './SourceLinks.svelte';

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
    /** The doc or page, to pick up a sync that's already running when the page opens. */
    readonly target?: { readonly entityType: 'DOC' | 'PAGE'; readonly id: string };
    /** Reloads the page's data once that sync ends (onSyncNow does its own). */
    readonly onRefresh?: () => Promise<unknown>;
  }

  const { prompt, links, onSave, onAddLink, onUploadFile, creating = false, onCancel, empty = false, onSyncNow, lastSync = null, target, onRefresh }: Props = $props();

  const syncLine = $derived(lastSync ? lastSyncLine(lastSync) : null);

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

  const runSync = async (sync: () => Promise<SyncNowOutcome | null>) => {
    const before = String(lastSync?.at ?? null);
    syncing = true;
    syncNotice = null;
    try {
      syncNotice = await sync();
    } catch (e: unknown) {
      syncNotice = { tone: 'error', message: errorMessage(e) };
    } finally {
      noticeFor = before;
      syncing = false;
    }
  };

  const syncNow = async () => {
    if (onSyncNow) await runSync(onSyncNow);
  };

  // A sync started before the page opened (from another tab, or before a reload) still shows as running.
  $effect(() => {
    if (!target || !onSyncNow) return;
    const { entityType, id } = target;
    let live = true;
    void syncRunning(entityType, id).then((running) => {
      if (!running || !live || syncing) return;
      void runSync(async () => {
        try {
          return await waitForSync(entityType, id);
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
    <span class="badge accent">Sync</span>
    <span class="text-xs text-2">
      {#if creating}Say what Claude should take from each source; add the sources below.
      {:else if syncing}{$assistantName} is reading the sources and rewriting this…
      {:else if empty}Nothing written yet: choose Sync now, or ask Claude to write it from its sources.
      {:else}Claude rewrites this from its sources, following the prompt.{/if}
    </span>
    {#if onSyncNow && !editing && !creating}
      <button type="button" class="btn sm ml-auto" onclick={syncNow} disabled={syncing || links.length === 0} aria-busy={syncing} title={links.length === 0 ? 'Add a source first' : 'Claude reads each source and rewrites the text from the prompt'}>{syncing ? 'Syncing…' : 'Sync now'}</button>
    {/if}
    {#if onSave && !editing}
      <button type="button" class="btn icon sm" class:ml-auto={!onSyncNow} aria-label="Edit the prompt" title="Edit the prompt" onclick={startEditing}><PencilIcon /></button>
    {/if}
  </div>

  {#if editing}
    <form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); void save(); }}>
      <Field label="Prompt" hint={creating ? 'For example: PRD: scope and launch plan. Linear: status and dates. Flag any disagreement.' : 'Empty makes it an ordinary doc'}>
        {#snippet children({ id })}
          <!-- svelte-ignore a11y_autofocus -->
          <textarea {id} rows="3" maxlength="2000" bind:value={draft} autofocus={creating}></textarea>
        {/snippet}
      </Field>
      {#if error}<p class="form-error">{error}</p>{/if}
      <div class="form-actions">
        <button type="submit" class="btn primary sm" disabled={saving} aria-busy={saving}>{saving ? 'Saving…' : creating ? 'Make sync doc' : 'Save'}</button>
        <button type="button" class="btn ghost sm" onclick={cancel}>Cancel</button>
      </div>
    </form>
  {:else}
    <p class="prompt pre-line"><span class="label">Prompt</span> {prompt}</p>
  {/if}

  {#if syncLine && !creating && !syncing}
    <p class="text-xs last-sync" class:text-2={syncLine.tone === 'ok'} class:form-error={syncLine.tone === 'error'} class:warning={syncLine.tone === 'warning'} title={syncLine.title}>{syncLine.text}</p>
  {:else if !syncLine && !creating && !empty && !syncing && links.length > 0}
    <p class="text-xs text-2 last-sync">Not synced from its sources yet.</p>
  {/if}

  {#if syncNotice && showNotice}
    <p class="text-xs" class:form-error={syncNotice.tone === 'error'} class:warning={syncNotice.tone === 'warning'} role="status">{syncNotice.message}</p>
  {/if}

  {#if links.length > 0 || onAddLink || onUploadFile}<SourceLinks {links} onAdd={onAddLink} {onUploadFile} />{/if}
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
  .last-sync { margin: 0; }
</style>
