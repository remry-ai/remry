<script lang="ts">
  // Shows an entity in the right panel's Peek tab without leaving the page.
  // Open while `?<param>` is set (see peek-url.ts); it renders nothing here.
  import { onDestroy, type Snippet } from 'svelte';
  import { page } from '$app/state';
  import { rightPanelPeek } from '$lib/stores/right-panel';
  import { closePeek, PEEK_PARAM } from './peek-url';

  interface Props {
    readonly title: string;
    /** The entity's full page, for the Open link. */
    readonly href: string;
    readonly param?: string;
    readonly children: Snippet;
  }

  const { title, href, param = PEEK_PARAM, children }: Props = $props();

  const isOpen = $derived(page.url.searchParams.has(param));
  const close = () => closePeek(param);

  $effect(() => {
    rightPanelPeek.set(isOpen ? { title, href, content: children, onClose: close } : null);
  });
  onDestroy(() => rightPanelPeek.set(null));

  const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

  const handleKeydown = (e: KeyboardEvent) => {
    // Leave Escape to a popup opened from the peek (a todo) and to text fields.
    if (isOpen && e.key === 'Escape' && !page.url.searchParams.has('popup') && !isTyping(e.target)) close();
  };
</script>

<svelte:window onkeydown={handleKeydown} />
