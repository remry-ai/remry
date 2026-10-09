<script lang="ts">
  interface Props {
    readonly leftOpen: boolean;
    readonly onToggleLeft: () => void;
    readonly leftLabel?: string;
    readonly sidebar: any;
    readonly children: any;
  }

  const { leftOpen, onToggleLeft, leftLabel = 'Details', sidebar, children }: Props = $props();
</script>

<div class="page-wrap">
  {#if leftOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="drawer-backdrop" onclick={onToggleLeft}></div>
  {/if}

  <div class="columns">
    <section class="col col-left" class:drawer-open={leftOpen}>
      <button type="button" class="drawer-handle" data-side="left" class:active={leftOpen} onclick={onToggleLeft} title={leftLabel}>
        {leftLabel}
      </button>
      {@render sidebar()}
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
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
    gap: var(--sp-8);
    height: calc(100dvh - var(--nav-h) - 7rem);
  }
  .col {
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
  }
  .col-left { position: relative; }
  .drawer-backdrop { display: none; }

  // Not a mixin: the three-column layout needs ~850px before the sidebar becomes a drawer.
  @media (max-width: 849px) {
    .columns { display: block; height: auto; }
    .drawer-backdrop { display: block; }
    .col-left {
      position: fixed;
      // Below the top bar, which would otherwise cover the top of the drawer.
      top: var(--nav-h);
      left: 0;
      z-index: var(--z-drawer);
      width: 92vw;
      max-width: 520px;
      height: calc(100dvh - var(--nav-h));
      padding: var(--sp-5);
      overflow: visible;
      background: var(--surface);
      border-right: 1px solid var(--border);
      box-shadow: var(--shadow-3);
      transform: translateX(-100%);
      transition: transform 250ms ease;
      &.drawer-open { transform: translateX(0); }
      .drawer-handle { display: flex; }
    }
  }
</style>
