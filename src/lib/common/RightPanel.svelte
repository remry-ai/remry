<script lang="ts">
  import { rightPanelNotes, rightPanelPage, rightPanelPeek, rightPanelTab } from '$lib/stores/right-panel';
  import { panelWidth, activeDrawer, openDrawer, closeFloating } from '$lib/stores/drawers';
  import { clampDrawerWidth, PANEL_MIN_W } from '$lib/common/panel-width';
  import NotesList from '$lib/common/NotesList.svelte';
  import PageChat from '$lib/common/PageChat.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ResizeHandle from '$lib/ui/ResizeHandle.svelte';

  interface Props {
    /** Over the page instead of beside it. The CSS works this out itself for the first paint. */
    readonly floating: boolean;
    /** Floating and open. Docked open/closed is `<html data-right-closed>`. */
    readonly floatOpen: boolean;
    /** Float up to 1150px rather than 768px (list pages). */
    readonly collapseMedium: boolean;
  }

  const { floating, floatOpen, collapseMedium }: Props = $props();

  // A peek opening switches to its tab and shows the panel; closing it goes back to Notes.
  let hadPeek = false;
  $effect(() => {
    const hasPeek = $rightPanelPeek !== null;
    if (hasPeek && !hadPeek) {
      rightPanelTab.set('peek');
      openDrawer('right', floating);
    } else if (!hasPeek && hadPeek && $rightPanelTab === 'peek') {
      rightPanelTab.set('notes');
      closeFloating('right');
    }
    hadPeek = hasPeek;
  });

  // Kept within the window here; AppShell also leaves room for a docked sidebar.
  const setWidth = (width: number) =>
    panelWidth.set(clampDrawerWidth(width, { min: PANEL_MIN_W, viewport: window.innerWidth, floating }));
</script>

<!-- Outside the panel: its transform would make a fixed backdrop cover the panel itself. -->
{#if floatOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-backdrop" onclick={() => activeDrawer.set(null)}></div>
{/if}
<aside id="right-panel" class="right-panel" class:float-open={floatOpen} class:collapse-medium={collapseMedium}>
  <ResizeHandle edge="left" width={$panelWidth} label="Resize panel" onResize={setWidth} onReset={() => panelWidth.set(null)} />

  <div class="panel-header">
    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tab" class:active={$rightPanelTab === 'notes'} aria-selected={$rightPanelTab === 'notes'} onclick={() => rightPanelTab.set('notes')}>
        Notes{#if $rightPanelNotes} <span class="count">{$rightPanelNotes.notes.length}</span>{/if}
      </button>
      <button type="button" role="tab" class="tab" class:active={$rightPanelTab === 'chat'} aria-selected={$rightPanelTab === 'chat'} onclick={() => rightPanelTab.set('chat')}>
        Chat
      </button>
      {#if $rightPanelPeek}
        <button type="button" role="tab" class="tab" class:active={$rightPanelTab === 'peek'} aria-selected={$rightPanelTab === 'peek'} onclick={() => rightPanelTab.set('peek')}>
          Peek
        </button>
      {/if}
    </div>
    {#if $rightPanelTab === 'notes' && $rightPanelNotes?.onStartAdd}
      <button type="button" class="btn ghost sm" onclick={() => $rightPanelNotes?.onStartAdd?.()}>+ Note</button>
    {/if}
  </div>

  <div class="panel-body" hidden={$rightPanelTab !== 'notes'}>
    {#if $rightPanelNotes}
      <NotesList
        notes={$rightPanelNotes.notes}
        onEdit={$rightPanelNotes.onEdit ? (n) => $rightPanelNotes?.onEdit?.(n.id) : undefined}
        onRemove={$rightPanelNotes.onRemove}
      />
    {:else}
      <div class="panel-empty"><EmptyState message="Open a person, team, department or project to see its notes." /></div>
    {/if}
  </div>

  <!-- Hidden, not unmounted, so switching tabs keeps the conversation. A new page starts a new one. -->
  <div class="panel-chat" hidden={$rightPanelTab !== 'chat'}>
    {#if $rightPanelPage}
      {#key $rightPanelPage.entityId}
        <PageChat page={$rightPanelPage} />
      {/key}
    {:else}
      <div class="panel-empty"><EmptyState message="Open a person, team, project, goal or page to chat about it." /></div>
    {/if}
  </div>

  {#if $rightPanelPeek && $rightPanelTab === 'peek'}
    <div class="panel-peek">
      <div class="peek-header">
        <h3 class="truncate">{$rightPanelPeek.title}</h3>
        <a class="btn ghost sm" href={$rightPanelPeek.href}>Open</a>
        <button type="button" class="btn icon sm" aria-label="Close peek" onclick={$rightPanelPeek.onClose}>&times;</button>
      </div>
      <div class="panel-body">
        {@render $rightPanelPeek.content()}
      </div>
    </div>
  {/if}
</aside>

<style lang="scss">
  .right-panel {
    grid-row: span 2;
    position: fixed;
    top: 0;
    right: 0;
    width: var(--panel-drag-w, var(--panel-w));
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-left: 1px solid var(--border);
    overflow: visible;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    height: var(--nav-h);
    padding: 0 var(--sp-3) 0 var(--sp-4);
    border-bottom: 1px solid var(--border);
    .tabs { align-self: stretch; align-items: flex-end; border-bottom: none; }
    .count { font-weight: 400; margin-left: 2px; }
  }
  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-3) var(--sp-4);
  }
  .panel-chat {
    flex: 1;
    min-height: 0;
  }
  .panel-empty { padding-top: var(--sp-4); text-align: center; }
  .panel-peek {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .peek-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
    padding: var(--sp-3) var(--sp-3) var(--sp-2) var(--sp-4);
    h3 { flex: 1; min-width: 0; margin: 0; font-size: var(--fs-lg); }
  }

  // Docked and closed (set on <html> before the first paint).
  @media (min-width: 1150px) {
    :global(:root[data-right-closed]) .right-panel { display: none; }
  }
  @media (min-width: 768px) and (max-width: 1149px) {
    :global(:root[data-right-closed]) .right-panel:not(.collapse-medium) { display: none; }
  }

  // Floating: the breakpoints in stores/drawers.ts, as media queries so the
  // server's render is already right. Closed until `activeDrawer` opens it.
  @mixin floating {
    // Below the top bar, which would otherwise cover the panel header.
    top: var(--nav-h);
    height: calc(100dvh - var(--nav-h));
    width: min(var(--panel-drag-w, 520px), calc(100vw - 48px)); // 48px: FLOAT_GUTTER
    z-index: var(--z-drawer);
    box-shadow: var(--shadow-3);
    transform: translateX(100%);
    visibility: hidden;
    transition: transform 250ms ease, visibility 0s linear 250ms;
    &.float-open { transform: translateX(0); visibility: visible; transition: transform 250ms ease; }
  }
  @include below-md {
    .right-panel { @include floating; }
  }
  @media (min-width: 768px) and (max-width: 1149px) {
    .right-panel.collapse-medium { @include floating; }
  }
</style>
