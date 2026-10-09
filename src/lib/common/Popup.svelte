<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';
  import { closePopup } from '$lib/ui/popup-url';

  interface Props {
    readonly id: string;
    readonly title: string;
    readonly size?: 'sm' | 'md' | 'lg';
    /** Extra query params to drop when the popup closes (e.g. `todo`). */
    readonly clearParams?: readonly string[];
    readonly children: Snippet;
  }

  const { id, title, size = 'md', clearParams = [], children }: Props = $props();

  const isOpen = $derived($page.url.searchParams.get('popup') === id);
  const titleId = $props.id();

  const close = () => closePopup({ invalidate: true, clear: clearParams });

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) close();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (isOpen && e.key === 'Escape') close();
  };

  const focusFirst = (node: HTMLElement) => {
    const el = node.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea');
    el?.focus();
  };
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <dialog class="popup" open onclick={handleBackdropClick} aria-labelledby={titleId}>
    <div class="popup-panel" data-size={size} use:focusFirst>
      <header class="popup-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" class="btn icon" aria-label="Close" onclick={close}>&times;</button>
      </header>
      <div class="popup-body">
        {@render children()}
      </div>
    </div>
  </dialog>
{/if}

<style lang="scss">
  .popup {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 10vh var(--sp-4) var(--sp-4);
    border: 0;
    background: var(--scrim);
    backdrop-filter: blur(2px);
    color: inherit;
  }
  .popup-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 560px;
    max-height: 85vh;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-3);
    animation: popup-in 160ms ease;
    &[data-size='sm'] { max-width: 400px; }
    &[data-size='lg'] { max-width: 760px; }
  }
  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    flex-shrink: 0;
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5);
    border-bottom: 1px solid var(--border);
    h2 { margin: 0; font-size: var(--fs-base); }
  }
  .popup-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-5);
  }
  @keyframes popup-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
