<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    readonly message: string;
    readonly boxed?: boolean;
    readonly small?: boolean;
    readonly children?: Snippet;
  }

  const { message, boxed = false, small = false, children }: Props = $props();
</script>

<div class="empty" class:boxed class:text-sm={small}>
  <span>{message}</span>
  {#if children}{@render children()}{/if}
</div>
