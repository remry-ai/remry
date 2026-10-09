<script lang="ts" module>
  export interface MenuItem {
    readonly label: string;
    /** A link. Without it, the item is an action. */
    readonly href?: string;
    readonly onSelect?: () => void;
    /** The item the trigger currently shows: checked, and aria-current. */
    readonly current?: boolean;
    /** Draw a divider above this item. */
    readonly divided?: boolean;
  }
</script>

<script lang="ts">
  // A button that opens a short list of links and actions. Closes on Escape, on a
  // click outside, on Tab and after a pick. Arrow keys, Home and End move between items.
  import type { Snippet } from 'svelte';

  interface Props {
    /** The menu's accessible name, and the trigger text when there is no trigger snippet. */
    readonly label: string;
    readonly items: readonly MenuItem[];
    /** Trigger content. */
    readonly trigger?: Snippet;
    /** Show only the chevron, with `label` as the button's accessible name. */
    readonly iconOnly?: boolean;
    readonly align?: 'start' | 'end';
  }

  const { label, items, trigger, iconOnly = false, align = 'start' }: Props = $props();

  const menuId = $props.id();
  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);
  let button = $state<HTMLButtonElement | null>(null);
  let list = $state<HTMLDivElement | null>(null);

  const menuItems = (): HTMLElement[] => [...(list?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  const focusItem = (index: number) => {
    const elements = menuItems();
    elements[(index + elements.length) % elements.length]?.focus();
  };

  $effect(() => {
    if (open && list) focusItem(Math.max(0, items.findIndex((item) => item.current)));
  });

  const close = (refocus = false) => {
    open = false;
    if (refocus) button?.focus();
  };

  const pick = (item: MenuItem) => {
    close();
    item.onSelect?.();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    const index = menuItems().indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(-1);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const handleWindowClick = (e: MouseEvent) => {
    if (open && root && !root.contains(e.target as Node)) close();
  };
</script>

<svelte:window onclick={handleWindowClick} />

<div class="menu" bind:this={root}>
  <button
    bind:this={button}
    type="button"
    class="btn sm menu-trigger {iconOnly ? 'icon' : 'ghost'}"
    aria-label={iconOnly ? label : undefined}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? menuId : undefined}
    onclick={() => { open = !open; }}
  >
    {#if !iconOnly}
      {#if trigger}{@render trigger()}{:else}{label}{/if}
    {/if}
    <svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2.5 4 2.5 2.5L7.5 4" /></svg>
  </button>

  {#if open}
    <div bind:this={list} id={menuId} class="menu-list" class:end={align === 'end'} role="menu" aria-label={label} tabindex="-1" onkeydown={handleKeydown}>
      {#each items as item, i (i)}
        {#if item.divided}<div class="menu-divider" role="separator"></div>{/if}
        {#if item.href}
          <a role="menuitem" class="menu-item" href={item.href} tabindex="-1" aria-current={item.current ? 'true' : undefined} onclick={() => close()}>
            <span class="menu-check" aria-hidden="true">{item.current ? '✓' : ''}</span>
            <span class="truncate">{item.label}</span>
          </a>
        {:else}
          <button role="menuitem" type="button" class="menu-item" tabindex="-1" aria-current={item.current ? 'true' : undefined} onclick={() => pick(item)}>
            <span class="menu-check" aria-hidden="true">{item.current ? '✓' : ''}</span>
            <span class="truncate">{item.label}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .menu {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }
  .menu-trigger {
    min-width: 0;
    gap: var(--sp-1);
  }
  .chevron {
    flex-shrink: 0;
    color: var(--text-3);
  }
  .menu-list {
    position: absolute;
    top: calc(100% + var(--sp-1));
    left: 0;
    z-index: var(--z-nav);
    display: flex;
    flex-direction: column;
    min-width: 220px;
    max-width: 320px;
    padding: var(--sp-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-2);
    &.end {
      left: auto;
      right: 0;
    }
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    width: 100%;
    min-height: var(--control-h);
    padding: 0 var(--sp-3) 0 var(--sp-1);
    border-radius: var(--r-sm);
    font-size: var(--fs-md);
    color: var(--text);
    text-align: left;
    &:hover,
    &:focus-visible {
      background: var(--surface-hover);
      text-decoration: none;
      box-shadow: none;
    }
    &[aria-current='true'] {
      font-weight: 600;
    }
  }
  .menu-check {
    flex-shrink: 0;
    width: 16px;
    text-align: center;
    color: var(--accent);
  }
  .menu-divider {
    height: 1px;
    margin: var(--sp-1) 0;
    background: var(--border);
  }
</style>
