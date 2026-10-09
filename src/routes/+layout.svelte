<script lang="ts">
  import "./styles.scss";
  import { navigating } from "$app/stores";

  import type { LayoutData } from "./$types";

  let { children, data } = $props<{ children: any; data: LayoutData }>();

  const LOADING_MESSAGES: readonly string[] = [
    "Loading…",
    "Just a moment…",
    "Fetching data…",
  ];

  const pickMessage = (): string =>
    LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]!;

  let loadingMessage = $state(LOADING_MESSAGES[0]!);

  // Only a real page change shows the overlay; opening a popup or changing a
  // filter only touches the query string and should feel instant.
  const pageChanging = $derived(
    !!$navigating && $navigating.from?.url.pathname !== $navigating.to?.url.pathname,
  );

  $effect(() => {
    if (pageChanging) loadingMessage = pickMessage();
  });
</script>

<svelte:head></svelte:head>

{@render children()}

{#if pageChanging}
  <div
    class="nav-loading"
    role="status"
    aria-live="polite"
    aria-label="Loading"
  >
    <div class="bar"></div>
    <div class="pulse">
      <span></span>
      <span></span>
      <span></span>
      <span class="label">{loadingMessage}</span>
    </div>
  </div>
{/if}

<style lang="scss">
  .nav-loading {
    position: fixed;
    inset: 0;
    z-index: var(--z-loading);
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--scrim);
    backdrop-filter: blur(2px);
    animation: nav-fade-in 180ms ease;
  }

  .bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--accent) 40%,
      var(--accent) 60%,
      transparent
    );
    background-size: 200% 100%;
    animation: nav-bar 1.1s linear infinite;
  }

  .pulse {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.6rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-3);
  }
  .pulse span {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    background: var(--accent);
    animation: nav-pulse 1.2s ease-in-out infinite;
  }
  .pulse span:nth-child(1) { animation-delay: 0s; }
  .pulse span:nth-child(2) { animation-delay: 0.18s; }
  .pulse span:nth-child(3) { animation-delay: 0.36s; }
  .pulse .label {
    width: auto;
    height: auto;
    border-radius: 0;
    background: transparent;
    animation: none;
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
    color: var(--text-2);
    text-transform: uppercase;
    margin-left: 0.45rem;
  }

  @keyframes nav-bar {
    0% { background-position: 200% 0; }
    100% { background-position: -100% 0; }
  }
  @keyframes nav-pulse {
    0%, 100% { opacity: 0.25; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.1); }
  }
  @keyframes nav-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
