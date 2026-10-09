<script lang="ts">
  import { rightPanelNotes, rightPanelPage, rightPanelPeek, rightPanelTab, activeDrawer, panelWidth } from '$lib/stores/right-panel';
  import { clampPanelWidth, PANEL_KEY_STEP } from '$lib/common/panel-width';
  import NotesList from '$lib/common/NotesList.svelte';
  import PageChat from '$lib/common/PageChat.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  let drawerOpen = $state(false);
  let panel = $state<HTMLElement | null>(null);

  $effect(() => {
    if ($activeDrawer !== 'right' && drawerOpen) {
      drawerOpen = false;
    }
  });

  const closeDrawer = () => { drawerOpen = false; activeDrawer.set(null); };
  const toggleDrawer = () => { drawerOpen = !drawerOpen; activeDrawer.set(drawerOpen ? 'right' : null); };

  // A peek opening switches to its tab (and opens the drawer where the panel is one); closing it goes back to Notes.
  let hadPeek = false;
  $effect(() => {
    const hasPeek = $rightPanelPeek !== null;
    if (hasPeek && !hadPeek) {
      rightPanelTab.set('peek');
      drawerOpen = true;
      activeDrawer.set('right');
    } else if (!hasPeek && hadPeek && $rightPanelTab === 'peek') {
      rightPanelTab.set('notes');
      closeDrawer();
    }
    hadPeek = hasPeek;
  });

  // ----- Resizing: drag the left edge; arrow keys step; double-click resets -----
  let dragging = $state(false);

  const setWidth = (width: number) => panelWidth.set(clampPanelWidth(width, window.innerWidth));

  const startDrag = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = true;
  };
  const drag = (e: PointerEvent) => {
    if (dragging) setWidth(window.innerWidth - e.clientX);
  };
  const endDrag = () => { dragging = false; };

  const handleResizeKey = (e: KeyboardEvent) => {
    const current = panel?.offsetWidth ?? 0;
    if (e.key === 'ArrowLeft') setWidth(current + PANEL_KEY_STEP);
    else if (e.key === 'ArrowRight') setWidth(current - PANEL_KEY_STEP);
    else return;
    e.preventDefault();
  };
</script>

<!-- Outside the panel: its transform would make a fixed backdrop cover the panel itself. -->
{#if drawerOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="drawer-backdrop notes-backdrop" onclick={closeDrawer}></div>
{/if}
<aside class="right-panel" class:drawer-open={drawerOpen} class:resizing={dragging} bind:this={panel}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
  <div
    class="resize-handle"
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize panel"
    aria-valuenow={$panelWidth ?? undefined}
    tabindex="0"
    title="Drag to resize, double-click to reset"
    onpointerdown={startDrag}
    onpointermove={drag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    ondblclick={() => panelWidth.set(null)}
    onkeydown={handleResizeKey}
  ></div>
  <button type="button" class="drawer-handle" data-side="right" class:active={drawerOpen} onclick={toggleDrawer} title="Notes and chat">
    {$rightPanelTab === 'chat' ? 'Chat' : $rightPanelTab === 'peek' ? 'Peek' : 'Notes'}
  </button>

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
    width: var(--panel-w);
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-left: 1px solid var(--border);
    overflow: visible;
  }
  .drawer-backdrop { display: none; }

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

  // A strip over the left border: drag it to resize the panel.
  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -3px;
    width: 6px;
    z-index: var(--z-sticky);
    cursor: col-resize;
    touch-action: none;
    &::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 2px;
      width: 2px;
      background: transparent;
      transition: background var(--ease);
    }
    &:hover::after, &:focus-visible::after { background: var(--accent); }
    &:focus-visible { outline: none; }
  }
  .resizing {
    user-select: none;
    .resize-handle::after { background: var(--accent); }
  }

  @include below-md {
    .resize-handle { display: none; }
    .drawer-handle { display: flex; }
    .drawer-backdrop { display: block; }
    .right-panel {
      // Below the top bar, which would otherwise cover the panel header.
      top: var(--nav-h);
      height: calc(100dvh - var(--nav-h));
      width: min(520px, 92vw);
      z-index: var(--z-drawer);
      box-shadow: var(--shadow-3);
      transform: translateX(100%);
      transition: transform 250ms ease;
      &.drawer-open { transform: translateX(0); }
    }
  }
</style>
