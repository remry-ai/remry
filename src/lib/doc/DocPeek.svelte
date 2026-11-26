<script lang="ts">
  // A doc in the right panel's Peek tab (a SidePeek): its body as a wiki page's peek shows it
  // (BodyPreview). Read-only, except a drawing, whose zoomed picture has a pencil that opens
  // the editor; the Open link opens it on its entity's page. Loads in the browser on each id,
  // and again when the drawing editor closes.
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import { docPath } from '$shared/utils/entity';
  import type { EntityType } from '$shared/types/enums';
  import SidePeek from '$lib/ui/SidePeek.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import BodyPreview from './BodyPreview.svelte';
  import { errorMessage, submitOrThrow } from '$lib/ui/submit';
  import type { BodyType } from '$shared/types/body-types';

  interface Props {
    readonly id: string;
  }

  const { id }: Props = $props();

  interface PeekedDoc {
    readonly title: string;
    readonly bodyType: BodyType;
    readonly content: string;
    readonly entityType: EntityType;
    readonly entityId: string;
  }

  let loaded = $state.raw<{ readonly id: string; readonly doc: PeekedDoc } | null>(null);
  let failed = $state.raw<{ readonly id: string; readonly message: string } | null>(null);

  // Bumped when the drawing editor closes, so the picture shows what was drawn.
  let reloads = $state(0);

  $effect(() => {
    void reloads;
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

  // The server refuses these on an archived entity, and the editor shows its message.
  const handleSave = async (content: string): Promise<void> => {
    await submitOrThrow(() => trpc().doc.update.mutate({ id, content }));
  };
  // The page behind the peek may show the drawing too (a list's preview), so it reloads as well.
  const handleDrawingClosed = (): void => {
    reloads += 1;
    void invalidateAll();
  };
  const handleShare = async (): Promise<string> =>
    (await submitOrThrow(() => trpc().drawing.shareLink.mutate({ docId: id }))).url;
</script>

<SidePeek title={doc?.title ?? (error ? 'Doc' : 'Loading…')} {href}>
  {#if error}
    <EmptyState message={error} />
  {:else if doc}
    {#key id}
      <BodyPreview bodyType={doc.bodyType} content={doc.content} title={doc.title} emptyMessage="This doc is empty." onSave={handleSave} onShare={handleShare} onDrawingClosed={handleDrawingClosed} />
    {/key}
  {/if}
</SidePeek>
