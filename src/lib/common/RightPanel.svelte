<script lang="ts">
  import { rightPanelNotes, rightPanelPage, rightPanelPeek, rightPanelTab, rightPanelTodos } from '$lib/stores/right-panel';
  import { panelWidth, activeDrawer, openDrawer, closeFloating, toggleDrawer } from '$lib/stores/drawers';
  import { clampDrawerWidth, PANEL_MIN_W } from '$lib/common/panel-width';
  import NotesList from '$lib/common/NotesList.svelte';
  import PageChat from '$lib/common/PageChat.svelte';
  import TodoWidget from '$lib/todo/components/TodoWidget.svelte';
  import DoneTodos from '$lib/todo/components/DoneTodos.svelte';
  import { isClosedTodo } from '$lib/todo/utils';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ResizeHandle from '$lib/ui/ResizeHandle.svelte';
  import ChevronIcon from '$lib/ui/ChevronIcon.svelte';

  interface Props {
    /** Over the page instead of beside it. The CSS works this out itself for the first paint. */
    readonly floating: boolean;
    /** Open in its current mode, for the toggle's aria state. */
    readonly open: boolean;
    /** Floating and open. The CSS reads docked open/closed from `<html data-right-closed>`. */
    readonly floatOpen: boolean;
    /** Float up to 880px rather than 768px (list pages). */
    readonly collapseMedium: boolean;
  }

  const { floating, open, floatOpen, collapseMedium }: Props = $props();

  const TAB_LABELS = { notes: 'notes', done: 'done todos', chat: 'chat', peek: 'peek' } as const;
  const tabLabel = $derived(TAB_LABELS[$rightPanelTab]);
  const doneCount = $derived($rightPanelTodos?.todos.filter((t) => isClosedTodo(t.status)).length ?? 0);
  const toggleLabel = $derived(`${open ? 'Hide' : 'Show'} ${tabLabel}`);

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
      <button type="button" role="tab" class="tab" class:active={$rightPanelTab === 'done'} aria-selected={$rightPanelTab === 'done'} onclick={() => rightPanelTab.set('done')}>
        Done{#if $rightPanelTodos} <span class="count">{doneCount}</span>{/if}
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

  <!-- Active todos are pinned above the notes, which scroll on their own beneath them. -->
  <div class="panel-notes" hidden={$rightPanelTab !== 'notes'}>
    {#if $rightPanelTodos}
      <div class="pinned-todos">
        <TodoWidget todos={$rightPanelTodos.todos} onCreate={$rightPanelTodos.onCreate} onEditTodo={$rightPanelTodos.onEdit} />
      </div>
    {/if}
    <div class="panel-body">
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
  </div>

  <div class="panel-body" hidden={$rightPanelTab !== 'done'}>
    {#if $rightPanelTodos}
      <DoneTodos todos={$rightPanelTodos.todos} onEditTodo={$rightPanelTodos.onEdit} />
    {:else}
      <div class="panel-empty"><EmptyState message="Open a person, team, project, goal or page to see its done todos." /></div>
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
<!-- After the panel, so it sits on top of the panel's edge. -->
<button
  type="button"
  class="drawer-toggle right-toggle"
  class:float-open={floatOpen}
  class:collapse-medium={collapseMedium}
  aria-controls="right-panel"
  aria-expanded={open}
  aria-label={toggleLabel}
  title={toggleLabel}
  onclick={() => toggleDrawer('right', floating)}
>
  <ChevronIcon size={12} />
</button>

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
    // Above the top bar even when docked, so a nav too wide for its column never paints over it.
    z-index: var(--z-drawer);
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
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-3) var(--sp-4);
  }
  .panel-notes {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    &[hidden] { display: none; }
  }
  // Up to 40% of the panel; past that the todos scroll and the notes keep the rest.
  .pinned-todos {
    flex-shrink: 0;
    max-height: 40%;
    overflow-y: auto;
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border);
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

  // The toggle: on the panel's left edge while it's open (chevron pointing in, to
  // hide it), on the window's right edge while it's closed (pointing out, to show it).
  // 10px is half the toggle's width, so it straddles the edge.
  .right-toggle {
    position: fixed;
    top: calc(var(--nav-h) + var(--sp-4));
    right: calc(var(--panel-drag-w, var(--panel-w)) - 10px);
    // On the panel's edge, so above the panel.
    z-index: calc(var(--z-drawer) + 1);
    transition: right 250ms ease, color var(--ease), background var(--ease);
  }
  // Narrower on the window's edge, so it clears the page's padding on a phone.
  @mixin toggle-on-window-edge {
    right: 0;
    z-index: var(--z-drawer-toggle);
    width: 14px;
    border-right-width: 0;
    border-radius: var(--r-md) 0 0 var(--r-md);
    :global(svg) { rotate: 180deg; }
  }

  // Docked and closed (set on <html> before the first paint).
  @media (min-width: 880px) {
    :global(:root[data-right-closed]) .right-panel { display: none; }
    :global(:root[data-right-closed]) .right-toggle { @include toggle-on-window-edge; }
  }
  @media (min-width: 768px) and (max-width: 879px) {
    :global(:root[data-right-closed]) .right-panel:not(.collapse-medium) { display: none; }
    :global(:root[data-right-closed]) .right-toggle:not(.collapse-medium) { @include toggle-on-window-edge; }
  }

  // Floating: the breakpoints in stores/drawers.ts, as media queries so the
  // server's render is already right. Closed until `activeDrawer` opens it.
  @mixin floating {
    // Over the top bar too, like the floating sidebar.
    height: 100dvh;
    width: min(var(--panel-drag-w, 520px), calc(100vw - 48px)); // 48px: FLOAT_GUTTER
    z-index: var(--z-drawer);
    box-shadow: var(--shadow-3);
    transform: translateX(100%);
    visibility: hidden;
    transition: transform 250ms ease, visibility 0s linear 250ms;
    &.float-open { transform: translateX(0); visibility: visible; transition: transform 250ms ease; }
  }
  @mixin floating-toggle {
    @include toggle-on-window-edge;
    &.float-open {
      right: calc(min(var(--panel-drag-w, 520px), calc(100vw - 48px)) - 10px);
      z-index: calc(var(--z-drawer) + 1);
      width: 20px;
      border-right-width: 1px;
      border-radius: var(--r-md);
      :global(svg) { rotate: 0deg; }
    }
  }
  @include below-md {
    .right-panel { @include floating; }
    .right-toggle { @include floating-toggle; }
  }
  @media (min-width: 768px) and (max-width: 879px) {
    .right-panel.collapse-medium { @include floating; }
    .right-toggle.collapse-medium { @include floating-toggle; }
  }
</style>
