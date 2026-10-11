<script lang="ts">
  import { onDestroy } from 'svelte';
  import { activeDrawer, closeFloating, leftDrawer, leftFloating, sidebarWidth } from '$lib/stores/drawers';
  import { clampDrawerWidth, SIDEBAR_MIN_W } from '$lib/common/panel-width';
  import ResizeHandle from '$lib/ui/ResizeHandle.svelte';

  interface Props {
    readonly leftLabel?: string;
    readonly sidebar: any;
    readonly children: any;
  }

  const { leftLabel = 'Details', sidebar, children }: Props = $props();

  // The top bar's toggle shows while this page has a sidebar.
  $effect(() => { leftDrawer.set({ label: leftLabel }); });
  onDestroy(() => { leftDrawer.set(null); closeFloating('left'); });

  // Docked open/closed is `<html data-left-closed>`, which the CSS reads; floating is a media query there too.
  const floatOpen = $derived($leftFloating && $activeDrawer === 'left');

  // Kept within the window here; AppShell also leaves room for a docked right panel.
  const setWidth = (width: number) =>
    sidebarWidth.set(clampDrawerWidth(width, { min: SIDEBAR_MIN_W, viewport: window.innerWidth, floating: $leftFloating }));
</script>

<div class="page-wrap">
  {#if floatOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="drawer-backdrop" onclick={() => activeDrawer.set(null)}></div>
  {/if}

  <div class="columns" class:float-open={floatOpen}>
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
  // The handle sits outside the scroller, so it stays put while the sidebar scrolls.
  .col-left { position: relative; }
  .col-scroll { height: 100%; }

  // Docked and closed (set on <html> before the first paint).
  @media (min-width: 850px) {
    :global(:root[data-left-closed]) .columns {
      grid-template-columns: minmax(0, 1fr);
      .col-left { display: none; }
    }
  }

  // Below 850px (`leftFloating` in stores/drawers.ts, a media query here so the
  // server's render is already right) the sidebar covers the page instead.
  @media (max-width: 849px) {
    .columns {
      display: block;
      height: auto;
    }
    .col-left {
      position: fixed;
      // Below the top bar, which would otherwise cover the top of the drawer.
      top: var(--nav-h);
      left: 0;
      z-index: var(--z-drawer);
      width: min(var(--sidebar-drag-w, 360px), calc(100vw - 48px)); // 48px: FLOAT_GUTTER
      height: calc(100dvh - var(--nav-h));
      background: var(--surface);
      border-right: 1px solid var(--border);
      box-shadow: var(--shadow-3);
      transform: translateX(-100%);
      visibility: hidden;
      transition: transform 250ms ease, visibility 0s linear 250ms;
    }
    .col-scroll { padding: var(--sp-5); }
    .float-open .col-left { transform: translateX(0); visibility: visible; transition: transform 250ms ease; }
  }
</style>
