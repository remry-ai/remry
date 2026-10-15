<script lang="ts">
  // Shown in the browser after a link opened in the desktop app's window. The tab closes
  // itself: a browser lets a page close a tab whose history is just this page, which is
  // what a link clicked in another app (Claude) opens. Where it refuses (a tab with
  // history), it stays, and says so.
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  const { data } = $props<{ data: PageData }>();

  // A refused close does nothing and throws nothing, so check a moment later.
  const CLOSE_CHECK_MS = 300;

  let closing = $state(true);

  onMount(() => {
    window.close();
    const timer = setTimeout(() => { closing = false; }, CLOSE_CHECK_MS);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head><title>Opened in Remry</title></svelte:head>

<main class="opened">
  <h1>Opened in Remry</h1>
  {#if closing}
    <p class="text-2">The page is open in the Remry app. Closing this tab…</p>
  {:else}
    <p class="text-2">The page is open in the Remry app. You can close this tab.</p>
    <a class="btn" href={data.target}>Show it here instead</a>
  {/if}
</main>

<style lang="scss">
  .opened {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-10) var(--sp-4);
    text-align: center;
  }
  h1 { font-size: var(--fs-xl); }
</style>
