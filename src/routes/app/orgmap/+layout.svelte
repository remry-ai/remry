<script lang="ts">
  import type { Snippet } from 'svelte';
  // The org chart needs the whole window; the notes panel has nothing to show here.
  import { layoutConfig, DEFAULT_LAYOUT } from '$lib/stores/layout';
  import { onDestroy } from 'svelte';

  layoutConfig.set({ ...DEFAULT_LAYOUT, hideInfoPanel: true });
  onDestroy(() => layoutConfig.set(DEFAULT_LAYOUT));

  const { children } = $props<{ children: Snippet }>();
</script>

{@render children()}
