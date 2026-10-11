<script lang="ts">
  // A wiki page in a side peek: its properties, parent, content (a sheet
  // shows as a table), sub-pages and open todos. Read-only; Open goes to the
  // full page, and a sub-page opens in the peek.
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import { errorMessage } from '$lib/ui/submit';
  import { openPopup } from '$lib/ui/popup-url';
  import { openPeek } from '$lib/ui/peek-url';
  import SidePeek from '$lib/ui/SidePeek.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import StatusDot from '$lib/todo/components/StatusDot.svelte';
  import PriorityBadge from '$lib/todo/components/PriorityBadge.svelte';
  import type { TodoStatus } from '$lib/todo/utils';
  import { formatPropertyValue, kindName } from '$lib/page/utils';
  import { readSheetContent, sheetToMarkdown } from '$shared/utils/sheet';
  import type { PageDetail, PageKindDefinition } from '$shared/types/pages';

  interface Props {
    readonly id: string;
    readonly kinds: readonly PageKindDefinition[];
  }

  const { id, kinds }: Props = $props();

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

  // Reload when the peeked page changes, and when a popup closes (a todo edited from here).
  const popupOpen = $derived(page.url.searchParams.has('popup'));
  $effect(() => {
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
  const fields = $derived(kinds.find((k) => k.key === wikiPage?.kind)?.fields ?? []);
  const body = $derived(
    !wikiPage ? '' : wikiPage.bodyType === 'sheet' ? sheetToMarkdown(readSheetContent(wikiPage.content)) : wikiPage.content
  );
</script>

<SidePeek title={wikiPage?.title ?? (error ? 'Page' : 'Loading…')} href="/app/wiki/{id}">
  {#if error}
    <EmptyState message={error} />
  {:else if peeked && wikiPage}
    <dl class="meta-list">
      {#each fields as field (field.key)}
        {@const value = wikiPage.properties[field.key]}
        {#if value !== undefined}
          <div>
            <dt>{field.label}</dt>
            <dd>
              {#if field.input === 'url'}
                <a href={String(value)} target="_blank" rel="noreferrer">{value}</a>
              {:else}
                {formatPropertyValue(field, value)}
              {/if}
            </dd>
          </div>
        {/if}
      {/each}
      {#if wikiPage.parent}
        <div>
          <dt>Parent</dt>
          <dd><button type="button" class="btn link" onclick={() => wikiPage.parent && openPeek(wikiPage.parent.id)}>{wikiPage.parent.title}</button></dd>
        </div>
      {/if}
      {#if wikiPage.archivedAt}
        <div><dt>Archived</dt><dd>{new Date(wikiPage.archivedAt).toLocaleDateString('en-CA')}</dd></div>
      {/if}
    </dl>

    {#if body.trim()}
      {#key wikiPage.id}
        <div class="card compact content"><MarkdownRenderer content={body} /></div>
      {/key}
    {:else}
      <div class="content"><EmptyState message="This page is empty." /></div>
    {/if}

    <section class="section">
      <div class="section-header"><h4>Sub-pages <span class="count">{wikiPage.children.length}</span></h4></div>
      {#if wikiPage.children.length > 0}
        <ul class="list">
          {#each wikiPage.children as child (child.id)}
            <li class="list-row">
              <button type="button" class="btn link grow truncate row-link" onclick={() => openPeek(child.id)}>{child.title}</button>
              <span class="badge">{kindName(kinds, child.kind)}</span>
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
  .content { margin-top: var(--sp-3); }
  .row-link { justify-content: flex-start; text-align: left; }
</style>
