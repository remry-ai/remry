<script lang="ts">
  // A doc's or wiki page's body, read-only, the same in every peek: a document as rendered
  // markdown, a spreadsheet as a table of the values its cells showed (bodyMarkdown), a
  // drawing as its picture.
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import DrawingImage from '$lib/drawing/DrawingImage.svelte';
  import { bodyMarkdown } from '$shared/utils/body';
  import { isEmptyDrawing, readDrawingContent } from '$shared/utils/drawing';
  import type { BodyType } from '$shared/types/body-types';

  interface Props {
    readonly bodyType: BodyType;
    readonly content: string;
    readonly title: string;
    /** Shown when there's nothing in it: "This page is empty." */
    readonly emptyMessage: string;
  }

  const { bodyType, content, title, emptyMessage }: Props = $props();

  const markdown = $derived(bodyType === 'drawing' ? '' : bodyMarkdown(bodyType, content));
  const empty = $derived(bodyType === 'drawing' ? isEmptyDrawing(readDrawingContent(content)) : !markdown.trim());
</script>

{#if empty}
  <div class="content"><EmptyState message={emptyMessage} /></div>
{:else}
  <div class="card compact content">
    {#if bodyType === 'drawing'}
      <DrawingImage {content} {title} />
    {:else}
      <MarkdownRenderer content={markdown} />
    {/if}
  </div>
{/if}

<style lang="scss">
  .content { margin-top: var(--sp-3); }
</style>
