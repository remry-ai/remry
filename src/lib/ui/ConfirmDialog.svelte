<script lang="ts">
  // A confirmation over everything else, for a destructive action that needs more than a
  // two-click button can say (DeleteEntityButton: what a delete takes with it). It sits on
  // <body> above popups (--z-viewer), so it can open from inside an edit popup. Esc and Cancel
  // close it without closing the popup underneath; a click outside does nothing.
  import type { Snippet } from 'svelte';

  interface Props {
    readonly title: string;
    readonly confirmLabel: string;
    /** Throws to show its message in the dialog. */
    readonly onConfirm: () => Promise<void> | void;
    readonly onCancel: () => void;
    readonly children: Snippet;
  }

  const { title, confirmLabel, onConfirm, onCancel, children }: Props = $props();
  const titleId = $props.id();

  let busy = $state(false);
  let error = $state('');

  const confirm = async () => {
    busy = true;
    error = '';
    try {
      await onConfirm();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Could not complete that.';
    } finally {
      busy = false;
    }
  };

  // In the capture phase, so the popup underneath never sees this Esc.
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    if (!busy) onCancel();
  };

  const portal = (node: HTMLElement): { destroy: () => void } => {
    document.body.append(node);
    return { destroy: () => node.remove() };
  };

  const focusCancel = (node: HTMLButtonElement) => { node.focus(); };
</script>

<svelte:window onkeydowncapture={handleKeydown} />

<div class="confirm-dialog" use:portal>
  <div class="panel" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
    <h2 id={titleId}>{title}</h2>
    <div class="body">{@render children()}</div>
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <div class="form-actions">
      <span class="ml-auto actions">
        <button type="button" class="btn ghost" onclick={onCancel} disabled={busy} use:focusCancel>Cancel</button>
        <button type="button" class="btn danger solid" onclick={confirm} disabled={busy} aria-busy={busy}>{busy ? 'Deleting…' : confirmLabel}</button>
      </span>
    </div>
  </div>
</div>

<style lang="scss">
  .confirm-dialog {
    position: fixed;
    inset: 0;
    z-index: var(--z-viewer);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 15vh var(--sp-4) var(--sp-4);
    background: var(--scrim);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    width: 100%;
    max-width: 480px;
    max-height: 75vh;
    padding: var(--sp-5);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-3);
    h2 { margin: 0; font-size: var(--fs-base); }
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .actions { display: inline-flex; gap: var(--sp-2); }
</style>
