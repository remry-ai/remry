<script lang="ts">
  import type { Snippet } from 'svelte';
  import { layoutConfig, DEFAULT_LAYOUT } from '$lib/stores/layout';
  import { onDestroy } from 'svelte';

  layoutConfig.set({ ...DEFAULT_LAYOUT, collapseInfoPanel: true });
  onDestroy(() => layoutConfig.set(DEFAULT_LAYOUT));

  const { children } = $props<{ children: Snippet }>();
</script>

{@render children()}
