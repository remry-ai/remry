<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    readonly children: Snippet;
  }

  const { children }: Props = $props();
</script>

<div class="page">
  {@render children()}
</div>
