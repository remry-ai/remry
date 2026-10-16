<script lang="ts">
  // A detail page's side peek: shows whatever a row's PeekButton opened (`?peek=<TYPE>:<id>`)
  // in the right panel's Peek tab, with the type's own peek component. A plain `?peek=<id>` is
  // a list page's, and shows nothing here.
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import type { PageKindDefinition } from '$shared/types/pages';
  import { parsePeek, PEEK_PARAM } from '$lib/ui/peek-url';
  import ProjectPeek from '$lib/project/components/ProjectPeek.svelte';
  import PagePeek from '$lib/page/components/PagePeek.svelte';
  import GoalPeek from '$lib/goal/components/GoalPeek.svelte';
  import PersonPeek from '$lib/person/components/PersonPeek.svelte';
  import DocPeek from '$lib/doc/DocPeek.svelte';

  const target = $derived(parsePeek(page.url.searchParams.get(PEEK_PARAM)));

  // A wiki page's peek shows its fields by its kind; loaded the first time one is peeked.
  let kinds = $state.raw<readonly PageKindDefinition[] | null>(null);
  $effect(() => {
    if (target?.type !== 'PAGE' || kinds) return;
    trpc().pageKind.list.query().then((result) => { kinds = result.ok ? result.value : []; }, () => { kinds = []; });
  });
</script>

{#if target?.type === 'PROJECT'}
  <ProjectPeek id={target.id} />
{:else if target?.type === 'PAGE' && kinds}
  <PagePeek id={target.id} {kinds} />
{:else if target?.type === 'GOAL'}
  <GoalPeek id={target.id} />
{:else if target?.type === 'PERSON'}
  <PersonPeek id={target.id} />
{:else if target?.type === 'DOC'}
  <DocPeek id={target.id} />
{/if}
