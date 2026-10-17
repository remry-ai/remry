<script lang="ts">
  // The parts of a detail page a side peek runs through, in AppShell's order: the right panel
  // (which draws the peek's content, through `rightPanelPeek`), then the page's EntityPeek.
  import RightPanel from '../RightPanel.svelte';
  import EntityPeek from '../EntityPeek.svelte';
</script>

<RightPanel floating={false} open={true} floatOpen={false} collapseMedium={false} />
<EntityPeek />
