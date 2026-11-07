<script lang="ts">
  // An open doc's save state and Save, the same for every type: "● Unsaved" while there are
  // changes, and Save, which is disabled with nothing to save and reads "Saving…" while it runs.
  interface Props {
    readonly dirty: boolean;
    readonly saving: boolean;
    readonly onSave: () => void;
  }

  const { dirty, saving, onSave }: Props = $props();
</script>

{#if dirty}<span class="unsaved text-xs">● Unsaved</span>{/if}
<button type="button" class="btn primary sm" onclick={onSave} disabled={saving || !dirty} aria-busy={saving}>{saving ? 'Saving…' : 'Save'}</button>

<style lang="scss">
  .unsaved { color: var(--text-3); white-space: nowrap; }
</style>
