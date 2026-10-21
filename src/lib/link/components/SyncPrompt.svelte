<script lang="ts">
  // The banner on a sync doc or sync wiki page: it says so, shows the prompt
  // (what Claude pulls from each source when it refreshes the text below) and
  // the sources. The prompt is editable here; clearing it makes an ordinary doc.
  // `creating` opens it on an empty prompt, for "Make sync doc"; Cancel leaves it as it was.
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import Field from '$lib/ui/Field.svelte';
  import { submit } from '$lib/ui/submit';
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
    /** Making a doc a sync doc: opens on the prompt box, and Cancel calls `onCancel`. */
    readonly creating?: boolean;
    readonly onCancel?: () => void;
    /** Nothing written yet: say that Claude writes it. The app never does. */
    readonly empty?: boolean;
  }

  const { prompt, links, onSave, onAddLink, creating = false, onCancel, empty = false }: Props = $props();

  // svelte-ignore state_referenced_locally
  let editing = $state(creating);
  let draft = $state('');
  let saving = $state(false);
  let error = $state('');

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
      {:else if empty}Nothing written yet: ask Claude to write it from its sources.
      {:else}Claude rewrites this from its sources, following the prompt.{/if}
    </span>
    {#if onSave && !editing}
      <button type="button" class="btn icon sm ml-auto" aria-label="Edit the prompt" title="Edit the prompt" onclick={startEditing}><PencilIcon /></button>
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

  {#if links.length > 0 || onAddLink}<SourceLinks {links} onAdd={onAddLink} />{/if}
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
</style>
