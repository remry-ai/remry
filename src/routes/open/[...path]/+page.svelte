<script lang="ts">
  // Shown in the browser after a link opened in the desktop app's window.
  import type { PageData } from './$types';

  const { data } = $props<{ data: PageData }>();
</script>

<svelte:head><title>Opened in Remry</title></svelte:head>

<main class="opened">
  <h1>Opened in Remry</h1>
  <p class="text-2">The page is open in the Remry app. You can close this tab.</p>
  <a class="btn" href={data.target}>Show it here instead</a>
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
