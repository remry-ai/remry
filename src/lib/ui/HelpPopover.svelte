<script lang="ts">
  // A small "?" button that opens help in a panel beside it, for help that would crowd
  // the page if it were always shown (a spreadsheet's formulas). Closes on a click outside,
  // on Escape (focus goes back to the button) and on the panel's ×.
  import type { Snippet } from 'svelte';

  interface Props {
    /** The button's text, and the panel's name: "Formula help". */
    readonly label: string;
    /** Opens above the button (at the bottom of something) or below it. */
    readonly placement?: 'above' | 'below';
    readonly children: Snippet;
  }

  const { label, placement = 'below', children }: Props = $props();

  const panelId = $props.id();
  let open = $state(false);
  let root = $state<HTMLSpanElement | null>(null);
  let button = $state<HTMLButtonElement | null>(null);

  const close = (refocus = false) => {
    open = false;
    if (refocus) button?.focus();
  };

  const handleWindowClick = (e: MouseEvent) => {
    if (open && root && !root.contains(e.target as Node)) close();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };
</script>

<svelte:window onclick={handleWindowClick} />

<span class="help-popover" bind:this={root} onkeydown={handleKeydown} role="presentation">
  <button bind:this={button} type="button" class="btn link help-trigger" aria-expanded={open} aria-controls={open ? panelId : undefined} onclick={() => { open = !open; }}>
    <span class="help-mark" aria-hidden="true">?</span>{label}
  </button>
  {#if open}
    <div id={panelId} class="help-panel" class:above={placement === 'above'} role="dialog" aria-label={label}>
      <div class="help-head">
        <strong>{label}</strong>
        <button type="button" class="btn icon sm" aria-label="Close" title="Close" onclick={() => close(true)}>&times;</button>
      </div>
      {@render children()}
    </div>
  {/if}
</span>

<style lang="scss">
  .help-popover {
    position: relative;
    display: inline-flex;
  }
  .help-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--text-2);
    font-size: inherit;
  }
  // A small ringed "?", drawn in the text's colour.
  .help-mark {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border: 1px solid currentColor;
    border-radius: var(--r-full);
    font-size: var(--fs-xs);
    line-height: 1;
  }
  .help-panel {
    position: absolute;
    top: calc(100% + var(--sp-1));
    left: 0;
    z-index: var(--z-nav);
    width: min(640px, calc(100vw - 2 * var(--sp-4)));
    // Long help scrolls inside it rather than running under the top bar.
    max-height: min(24rem, 60vh);
    overflow-y: auto;
    padding: var(--sp-3);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-2);
    color: var(--text);
    font-size: var(--fs-sm);
    &.above {
      top: auto;
      bottom: calc(100% + var(--sp-1));
    }
  }
  .help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }
</style>
