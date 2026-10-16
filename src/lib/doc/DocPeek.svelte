<script lang="ts">
  // A doc in the right panel's Peek tab (a SidePeek): its text, rendered. Read-only; the
  // Open link opens it on its entity's page. Loads in the browser on each id.
  import { trpc } from '$shared/trpc/client';
  import { docPath } from '$shared/utils/entity';
  import type { EntityType } from '$shared/types/enums';
  import SidePeek from '$lib/ui/SidePeek.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import { errorMessage } from '$lib/ui/submit';

  interface Props {
    readonly id: string;
  }

  const { id }: Props = $props();

  interface PeekedDoc {
    readonly title: string;
    readonly content: string;
    readonly entityType: EntityType;
    readonly entityId: string;
  }

  let loaded = $state.raw<{ readonly id: string; readonly doc: PeekedDoc } | null>(null);
  let failed = $state.raw<{ readonly id: string; readonly message: string } | null>(null);

  $effect(() => {
    const docId = id;
    let stale = false;
    trpc().doc.get.query({ id: docId }).then(
      (result) => {
        if (stale) return;
        if (result.ok) { loaded = { id: docId, doc: result.value }; failed = null; }
        else failed = { id: docId, message: result.error.message };
      },
      (e: unknown) => { if (!stale) failed = { id: docId, message: errorMessage(e) }; }
    );
    return () => { stale = true; };
  });

  const doc = $derived(loaded?.id === id ? loaded.doc : null);
  const error = $derived(failed?.id === id ? failed.message : null);
  const href = $derived(doc ? docPath(doc.entityType, doc.entityId, id) : '');
</script>

<SidePeek title={doc?.title ?? (error ? 'Doc' : 'Loading…')} {href}>
  {#if error}
    <EmptyState message={error} />
  {:else if doc}
    {#key id}
      <MarkdownRenderer content={doc.content} placeholder="*This doc is empty.*" />
    {/key}
  {/if}
</SidePeek>
