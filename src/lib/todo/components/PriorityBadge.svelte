<script lang="ts">
  import { priorityLabel } from '../utils';

  interface Props {
    readonly priority: number;
  }

  const { priority }: Props = $props();
</script>

{#if priority > 0}
  <span class="priority" data-level={priority} title="Priority {priority}">{priorityLabel(priority)}</span>
{/if}

<style lang="scss">
  .priority {
    font-size: var(--fs-sm);
    font-weight: 800;
    letter-spacing: -0.05em;
    flex-shrink: 0;
    &[data-level='1'] { color: var(--text-2); }
    &[data-level='2'] { color: var(--warning); }
    &[data-level='3'] { color: var(--danger); }
  }
</style>
