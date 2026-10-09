<script lang="ts">
  import type { TodoStatus } from '../utils';

  interface Props {
    readonly status: TodoStatus;
    readonly clickable?: boolean;
    readonly onclick?: () => void;
  }

  const { status, clickable = false, onclick }: Props = $props();
</script>

{#if clickable}
  <button type="button" class="status-toggle" title="Advance status" aria-label="Advance status" {onclick}>
    <span class="dot" data-status={status}></span>
  </button>
{:else}
  <span class="status-toggle static">
    <span class="dot" data-status={status}></span>
  </span>
{/if}

<style lang="scss">
  .status-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border-radius: var(--r-full);
    &:hover .dot { border-color: var(--accent); }
    &.static { cursor: default; &:hover .dot { border-color: var(--border-strong); } }
  }
  .dot {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--border-strong);
    background: transparent;
    transition: border-color var(--ease), background var(--ease);
    &[data-status='ACTIVE'] { background: var(--warning); border-color: var(--warning); }
    &[data-status='COMPLETE'] { background: var(--success); border-color: var(--success); }
    &[data-status='CANCELLED'] { background: var(--border-strong); border-color: var(--border-strong); }
  }
</style>
