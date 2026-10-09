<script lang="ts">
  import { marked } from 'marked';

  interface Props {
    readonly value: string;
    readonly placeholder?: string;
    readonly readonly?: boolean;
    readonly onSave?: (value: string) => void | Promise<void>;
  }

  const { value, placeholder = 'Click to add content...', readonly: isReadonly = false, onSave }: Props = $props();

  let editing = $state(false);
  let draft = $state('');
  let saving = $state(false);

  const startEdit = () => {
    if (isReadonly) return;
    draft = value;
    editing = true;
  };

  const cancel = () => {
    editing = false;
  };

  const save = async () => {
    if (!onSave) return;
    saving = true;
    try {
      await onSave(draft);
      editing = false;
    } finally {
      saving = false;
    }
  };
</script>

{#if editing}
  <div class="md-editor">
    <textarea bind:value={draft} rows={6}></textarea>
    <div class="md-actions">
      <button type="button" class="btn ghost sm" onclick={cancel} disabled={saving}>Cancel</button>
      <button type="button" class="btn primary sm" onclick={save} disabled={saving} aria-busy={saving}>Save</button>
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="md-preview"
    class:clickable={!isReadonly}
    class:empty={!value}
    onclick={startEdit}
  >
    {#if value}
      {@html marked.parse(value)}
    {:else}
      <span class="placeholder">{placeholder}</span>
    {/if}
  </div>
{/if}

<style lang="scss">
  .md-preview {
    font-size: var(--fs-md);
    line-height: 1.6;

    &.clickable {
      cursor: pointer;
      border-radius: var(--r-sm);
      padding: var(--sp-2);
      margin: calc(-1 * var(--sp-2));
      transition: background var(--ease);
      &:hover { background: var(--surface-hover); }
    }

    &.empty { min-height: 2rem; }

    :global(p:last-child) { margin-bottom: 0; }
  }

  .placeholder {
    color: var(--text-3);
    font-style: italic;
  }

  .md-editor textarea {
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
  }

  .md-actions {
    display: flex;
    gap: var(--sp-2);
    justify-content: flex-end;
    margin-top: var(--sp-2);
  }
</style>
