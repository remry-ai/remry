<script lang="ts">
  // A wiki page in a side peek: its parent, content (BodyPreview, as a doc's peek shows it),
  // sub-pages and open todos. Read-only, except a drawing (not archived), whose zoomed picture
  // has a pencil that opens the editor; Open goes to the full page, and a sub-page opens in the peek.
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import { errorMessage, submitOrThrow } from '$lib/ui/submit';
  import { openPopup } from '$lib/ui/popup-url';
  import { openPeek, peekValue } from '$lib/ui/peek-url';
  import SidePeek from '$lib/ui/SidePeek.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import StatusDot from '$lib/todo/components/StatusDot.svelte';
  import PriorityBadge from '$lib/todo/components/PriorityBadge.svelte';
  import type { TodoStatus } from '$lib/todo/utils';
  import BodyPreview from '$lib/doc/BodyPreview.svelte';
  import type { PageDetail } from '$shared/types/pages';

  interface Props {
    readonly id: string;
  }

  const { id }: Props = $props();

  interface Todo {
    readonly id: string;
    readonly title: string;
    readonly status: TodoStatus;
    readonly priority: number;
  }

  interface Peeked {
    readonly page: PageDetail;
    readonly todos: readonly Todo[];
  }

  let loaded = $state.raw<{ readonly id: string; readonly value: Peeked } | null>(null);
  let failed = $state.raw<{ readonly id: string; readonly message: string } | null>(null);

  const load = async (pageId: string): Promise<Peeked | string> => {
    const client = trpc();
    const [result, todos] = await Promise.all([
      client.page.get.query({ id: pageId }),
      client.todo.forEntity.query({ entityType: 'PAGE', entityId: pageId })
    ]);
    if (!result.ok) return result.error.message;
    return {
      // Dates arrive as strings over the wire; the peek reads none of them.
      page: result.value as unknown as PageDetail,
      todos: (todos as readonly Todo[]).filter((t) => t.status !== 'COMPLETE' && t.status !== 'CANCELLED')
    };
  };

  // Reload when the peeked page changes, when a popup closes (a todo edited from here), and
  // when the drawing editor closes, so the picture shows what was drawn.
  const popupOpen = $derived(page.url.searchParams.has('popup'));
  let reloads = $state(0);
  $effect(() => {
    void reloads;
    const pageId = id;
    if (popupOpen) return;
    let stale = false;
    load(pageId).then(
      (result) => {
        if (stale) return;
        if (typeof result === 'string') failed = { id: pageId, message: result };
        else { loaded = { id: pageId, value: result }; failed = null; }
      },
      (e: unknown) => { if (!stale) failed = { id: pageId, message: errorMessage(e) }; }
    );
    return () => { stale = true; };
  });

  const peeked = $derived(loaded?.id === id ? loaded.value : null);
  const error = $derived(failed?.id === id ? failed.message : null);
  const wikiPage = $derived(peeked?.page ?? null);

  const handleSave = async (content: string): Promise<void> => {
    await submitOrThrow(() => trpc().page.update.mutate({ id, content }));
  };
  // The page behind the peek may show the drawing too (a list's preview), so it reloads as well.
  const handleDrawingClosed = (): void => {
    reloads += 1;
    void invalidateAll();
  };
  const handleShare = async (): Promise<string> =>
    (await submitOrThrow(() => trpc().drawing.shareLink.mutate({ pageId: id }))).url;
</script>

<SidePeek title={wikiPage?.title ?? (error ? 'Page' : 'Loading…')} href="/app/wiki/{id}">
  {#if error}
    <EmptyState message={error} />
  {:else if peeked && wikiPage}
    <dl class="meta-list">
      {#if wikiPage.parent}
        <div>
          <dt>Parent</dt>
          <dd><button type="button" class="btn link" onclick={() => wikiPage.parent && openPeek(peekValue('PAGE', wikiPage.parent.id))}>{wikiPage.parent.title}</button></dd>
        </div>
      {/if}
      {#if wikiPage.archivedAt}
        <div><dt>Archived</dt><dd>{new Date(wikiPage.archivedAt).toLocaleDateString('en-CA')}</dd></div>
      {/if}
    </dl>

    {#key wikiPage.id}
      <BodyPreview bodyType={wikiPage.bodyType} content={wikiPage.content} title={wikiPage.title} emptyMessage="This page is empty." onSave={wikiPage.archivedAt ? undefined : handleSave} onShare={handleShare} onDrawingClosed={handleDrawingClosed} />
    {/key}

    <section class="section">
      <div class="section-header"><h4>Sub-pages <span class="count">{wikiPage.children.length}</span></h4></div>
      {#if wikiPage.children.length > 0}
        <ul class="list">
          {#each wikiPage.children as child (child.id)}
            <li class="list-row">
              <button type="button" class="btn link grow truncate row-link" onclick={() => openPeek(peekValue('PAGE', child.id))}>{child.title}</button>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No sub-pages." />
      {/if}
    </section>

    <section class="section">
      <div class="section-header"><h4>Open todos <span class="count">{peeked.todos.length}</span></h4></div>
      {#if peeked.todos.length > 0}
        <ul class="list">
          {#each peeked.todos as todo (todo.id)}
            <li class="list-row">
              <StatusDot status={todo.status} />
              <button type="button" class="btn link grow truncate row-link" onclick={() => openPopup('todo', { todo: todo.id })}>{todo.title}</button>
              <PriorityBadge priority={todo.priority} />
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No open todos." />
      {/if}
    </section>
  {:else}
    <EmptyState message="Loading…" />
  {/if}
</SidePeek>

<style lang="scss">
  .row-link { justify-content: flex-start; text-align: left; }
</style>
