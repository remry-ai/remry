<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    readonly label: string;
    readonly hint?: string;
    readonly error?: string | null;
    readonly children: Snippet<[{ readonly id: string }]>;
  }

  const { label, hint, error = null, children }: Props = $props();
  const id = $props.id();
</script>

<div class="field" class:has-error={!!error}>
  <label for={id}>{label}</label>
  {@render children({ id })}
  {#if error}
    <span class="error">{error}</span>
  {:else if hint}
    <span class="hint">{hint}</span>
  {/if}
</div>
