<script lang="ts">
  // Copies the page you're on as a link to share (`share-link.ts`). The desktop app's window
  // has no address bar, so this is the way to get one there; it works in a browser too.
  import { page } from '$app/stores';
  import { shareLink } from './share-link';

  interface Props {
    /** The open notebook's id, so the link opens it. */
    readonly notebookId: string | null;
  }

  const { notebookId }: Props = $props();

  const COPIED_MS = 1500;

  let copied = $state(false);
  let failed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // The clipboard API needs a secure context, which 127.0.0.1 is; the older command covers a
  // webview without it.
  const writeText = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to the command.
      }
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('Copy failed');
  };

  const copy = async (): Promise<void> => {
    clearTimeout(timer);
    try {
      await writeText(shareLink($page.url, notebookId));
      copied = true;
      failed = false;
    } catch {
      copied = false;
      failed = true;
    }
    timer = setTimeout(() => { copied = false; failed = false; }, COPIED_MS);
  };

  const label = $derived(copied ? 'Link copied' : failed ? "Couldn't copy the link" : 'Copy link to this page');

  $effect(() => () => clearTimeout(timer));
</script>

<button type="button" class="btn icon" class:copied aria-label={label} title={label} onclick={copy}>
  {#if copied}
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>
  {:else}
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5L8.25 4.25" />
      <path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0L3.5 9a2.5 2.5 0 0 0 3.5 3.5l.75-.75" />
    </svg>
  {/if}
</button>
<span class="sr-only" role="status">{copied ? 'Link copied' : failed ? "Couldn't copy the link" : ''}</span>

<style lang="scss">
  .copied { color: var(--success); }
</style>
