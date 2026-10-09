<script lang="ts">
  import { layoutConfig, DEFAULT_LAYOUT } from '$lib/stores/layout';
  import { onDestroy } from 'svelte';

  layoutConfig.set({ ...DEFAULT_LAYOUT, collapseInfoPanel: true });
  onDestroy(() => layoutConfig.set(DEFAULT_LAYOUT));

  const { children } = $props<{ children: any }>();
</script>

{@render children()}
