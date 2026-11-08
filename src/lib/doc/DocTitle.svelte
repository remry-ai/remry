<script lang="ts">
  // An open doc's title row, the same for every type: its tag (Doc, Spreadsheet, Drawing),
  // the title, whatever the doc adds after it, and a pencil at the far right to rename (Enter or
  // leaving the box saves, Esc cancels). A doc just made opens with its title selected, to type over.
  import type { Snippet } from 'svelte';
  import { BODY_LABELS, type BodyType } from '$shared/types/body-types';
  import { errorMessage } from '$lib/ui/submit';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';

  interface Props {
    readonly title: string;
    readonly bodyType: BodyType;
    readonly onSaveTitle?: (title: string) => Promise<void>;
    /** A doc just made: the title box is open and selected. */
    readonly autoEdit?: boolean;
    /** A paste into the title box; true when it took it (a document's images go into its body). */
    readonly onPaste?: (e: ClipboardEvent) => boolean;
    /** After the title: a document's "Convert with Claude". */
    readonly after?: Snippet;
  }

  const { title, bodyType, onSaveTitle, autoEdit = false, onPaste, after }: Props = $props();

  // Read once: a new doc starts with its title in the box.
  // svelte-ignore state_referenced_locally
  let editing = $state(autoEdit && !!onSaveTitle);
  // svelte-ignore state_referenced_locally
  let draft = $state(title);
  let error = $state('');

  const start = () => {
    if (!onSaveTitle) return;
    draft = title;
    editing = true;
  };

  const commit = async () => {
    editing = false;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === title || !onSaveTitle) return;
    error = '';
    try {
      await onSaveTitle(trimmed);
    } catch (e: unknown) {
      error = errorMessage(e);
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); editing = false; draft = title; }
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (onPaste?.(e)) void commit();
  };

  const focusOnMount = (node: HTMLInputElement) => { node.focus(); node.select(); };
</script>

<div class="doc-title-row">
  <span class="badge selected">{BODY_LABELS[bodyType]}</span>
  {#if editing}
    <input class="title-input" bind:value={draft} onblur={commit} onkeydown={handleKeydown} onpaste={handlePaste} use:focusOnMount aria-label="{BODY_LABELS[bodyType]} title" />
  {:else}
    <h2>{title}</h2>
  {/if}
  {#if after}{@render after()}{/if}
  {#if onSaveTitle && !editing}
    <button type="button" class="btn icon sm rename" aria-label="Rename {title}" title="Rename" onclick={start}><PencilIcon /></button>
  {/if}
</div>
{#if error}<p class="form-error" role="alert">{error}</p>{/if}

<style lang="scss">
  .doc-title-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    h2 {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: var(--fs-base);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rename { margin-inline-start: auto; }
  }
  // A field like any other (--font-text); only its width is its own.
  .title-input { flex: 1; }
</style>
