<script lang="ts">
  // What a locked Remry Pro feature shows instead of itself: what it is, why
  // it's locked (the server's message), and the way to the License page.
  import type { Snippet } from 'svelte';

  interface Props {
    /** The feature, as a heading: "PDF export". */
    readonly title: string;
    /** Why it's locked, from lockedMessage(). */
    readonly message: string;
    /** Inside a page section rather than in place of a whole page. */
    readonly compact?: boolean;
    /** Extra actions, such as a way back. */
    readonly children?: Snippet;
  }

  const { title, message, compact = false, children }: Props = $props();
</script>

<div class="card pro-lock" class:compact>
  <p class="heading"><span class="badge accent">Pro</span> <strong>{title}</strong></p>
  <p class="text-2 message">{message}</p>
  <div class="actions">
    <a class="btn primary sm" href="/app/license">Add a license</a>
    {#if children}{@render children()}{/if}
  </div>
</div>

<style lang="scss">
  .pro-lock { max-width: 560px; margin: var(--sp-8) auto; display: grid; gap: var(--sp-2); }
  .compact { margin: 0 0 var(--sp-4); max-width: none; }
  .heading { display: flex; align-items: center; gap: var(--sp-2); margin: 0; }
  .message { margin: 0; }
  .actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
</style>
