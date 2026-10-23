<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';
  import { activeDrawer, closeFloating, leftDocked, leftDrawer, leftFloating, sidebarWidth, toggleDrawer } from '$lib/stores/drawers';
  import { isDrawerOpen } from '$lib/common/drawer-state';
  import { clampDrawerWidth, SIDEBAR_MIN_W } from '$lib/common/panel-width';
  import ChevronIcon from '$lib/ui/ChevronIcon.svelte';
  import ResizeHandle from '$lib/ui/ResizeHandle.svelte';

  interface Props {
    readonly leftLabel?: string;
    readonly sidebar: Snippet;
    readonly children: Snippet;
  }

  const { leftLabel = 'Details', sidebar, children }: Props = $props();

  // AppShell counts a docked sidebar when it clamps the right panel's width.
  $effect(() => { leftDrawer.set({ label: leftLabel }); });
  onDestroy(() => { leftDrawer.set(null); closeFloating('left'); });

  // The CSS reads docked open/closed from `<html data-left-closed>` and floating from a
  // media query, so the first paint is right; JS only adds `.float-open`.
  const floatOpen = $derived($leftFloating && $activeDrawer === 'left');
  const open = $derived(isDrawerOpen('left', $leftFloating, $leftDocked, $activeDrawer));
  const toggleLabel = $derived(`${open ? 'Hide' : 'Show'} ${leftLabel.toLowerCase()}`);

  // Kept within the window here; AppShell also leaves room for a docked right panel.
  const setWidth = (width: number) =>
    sidebarWidth.set(clampDrawerWidth(width, { min: SIDEBAR_MIN_W, viewport: window.innerWidth, floating: $leftFloating }));
</script>

<div class="page-wrap" class:float-open={floatOpen}>
  {#if floatOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="drawer-backdrop" onclick={() => activeDrawer.set(null)}></div>
  {/if}

  <div class="columns">
    <section id="left-drawer" class="col col-left" aria-label={leftLabel}>
      <ResizeHandle edge="right" width={$sidebarWidth} label="Resize {leftLabel.toLowerCase()}" onResize={setWidth} onReset={() => sidebarWidth.set(null)} />
      <div class="col-scroll">
        {@render sidebar()}
      </div>
    </section>
    <section class="col col-center">
      {@render children()}
    </section>
  </div>

  <!-- After the drawer, so it sits on top of the drawer's edge. -->
  <button
    type="button"
    class="drawer-toggle left-toggle"
    aria-controls="left-drawer"
    aria-expanded={open}
    aria-label={toggleLabel}
    title={toggleLabel}
    onclick={() => toggleDrawer('left', $leftFloating)}
  >
    <ChevronIcon size={12} />
  </button>
</div>

<style lang="scss">
  .page-wrap {
    position: relative;
    padding: var(--sp-4) var(--sp-8);
    @include mobile { padding: var(--sp-4); }
  }

  .columns {
    display: grid;
    grid-template-columns: var(--sidebar-drag-w, var(--sidebar-w)) minmax(0, 1fr);
    gap: var(--sp-8);
    height: calc(100dvh - var(--nav-h) - 7rem);
  }
  .col {
    min-width: 0;
    height: 100%;
  }
  .col-center, .col-scroll {
    overflow-y: auto;
    overflow-x: hidden;
  }
  // Room under the last card (an open doc, the overview) before the site footer.
  .col-center { padding-bottom: var(--sp-8); }
  // The handle sits outside the scroller, so it stays put while the sidebar scrolls.
  .col-left { position: relative; }
  .col-scroll { height: 100%; }

  // The toggle stays on the window's left edge: in the page's margin beside a docked
  // sidebar, in a floating one's padding, or alone while it's closed. Only the chevron
  // turns: pointing left to hide the sidebar, right to show it. 18px wide fits the
  // floating drawer's padding (--sp-5); 14px on a phone fits the page's (--sp-4).
  .left-toggle {
    position: absolute;
    top: var(--sp-4);
    left: 0;
    z-index: var(--z-drawer-toggle);
    width: 18px;
    border-left-width: 0;
    border-radius: 0 var(--r-md) var(--r-md) 0;
    :global(svg) { rotate: 180deg; }
    @include mobile { width: 14px; }
  }

  // Docked (1300px up), the centre column scrolls on its own. The page's right padding moves
  // inside it, so its scrollbar sits on the window's edge (or the right panel's) rather than
  // over the text.
  @media (min-width: 1300px) {
    .page-wrap { padding-right: 0; }
    .col-center { padding-right: var(--sp-8); }
  }

  // Docked and closed (set on <html> before the first paint).
  @media (min-width: 1300px) {
    :global(:root[data-left-closed]) .columns {
      grid-template-columns: minmax(0, 1fr);
      .col-left { display: none; }
    }
    :global(:root[data-left-closed]) .left-toggle :global(svg) { rotate: 0deg; }
  }

  // Below 1300px (`leftFloating` in stores/drawers.ts, a media query here so the
  // server's render is already right) the sidebar covers the page, top bar included.
  @media (max-width: 1299px) {
    .columns {
      display: block;
      height: auto;
    }
    .col-left {
      position: fixed;
      top: 0;
      left: 0;
      z-index: var(--z-drawer);
      width: min(var(--sidebar-drag-w, 360px), calc(100vw - 48px)); // 48px: FLOAT_GUTTER
      height: 100dvh;
      background: var(--surface);
      border-right: 1px solid var(--border);
      box-shadow: var(--shadow-3);
      transform: translateX(-100%);
      visibility: hidden;
      transition: transform 250ms ease, visibility 0s linear 250ms;
    }
    .col-scroll { padding: var(--sp-5); }
    .float-open .col-left { transform: translateX(0); visibility: visible; transition: transform 250ms ease; }

    .left-toggle {
      position: fixed;
      top: calc(var(--nav-h) + var(--sp-4));
      :global(svg) { rotate: 0deg; }
    }
    // Over the open drawer, in its padding.
    .float-open .left-toggle {
      z-index: calc(var(--z-drawer) + 1);
      :global(svg) { rotate: 180deg; }
    }
  }
</style>
