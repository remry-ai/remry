<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    readonly title: string;
    readonly description?: string;
    readonly children?: Snippet;
  }

  const { title, description, children }: Props = $props();
</script>

<header class="page-header">
  <div>
    <h1>{title}</h1>
    {#if description}<p>{description}</p>{/if}
  </div>
  {#if children}
    <div class="actions">{@render children()}</div>
  {/if}
</header>
