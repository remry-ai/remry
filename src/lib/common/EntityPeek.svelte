<script lang="ts">
  // A detail page's side peek: shows whatever a row's PeekButton opened (`?peek=<TYPE>:<id>`)
  // in the right panel's Peek tab, with the type's own peek component. A plain `?peek=<id>` is
  // a list page's, and shows nothing here.
  import { page } from '$app/state';
  import { parsePeek, PEEK_PARAM, type PeekType } from '$lib/ui/peek-url';
  import ProjectPeek from '$lib/project/components/ProjectPeek.svelte';
  import PagePeek from '$lib/page/components/PagePeek.svelte';
  import GoalPeek from '$lib/goal/components/GoalPeek.svelte';
  import PersonPeek from '$lib/person/components/PersonPeek.svelte';
  import DocPeek from '$lib/doc/DocPeek.svelte';

  const target = $derived(parsePeek(page.url.searchParams.get(PEEK_PARAM)));
  // Each peek gets its id as a string or null, never through `target.id`: when the peek
  // param leaves the URL (Open, ×), Svelte reads a child's props once more before removing it,
  // and `target.id` on a null target threw, which stopped the navigation part way (the page
  // kept its old content, or a spinner) and left the peek open.
  const idFor = (type: PeekType): string | null => (target?.type === type ? target.id : null);
  const projectId = $derived(idFor('PROJECT'));
  const pageId = $derived(idFor('PAGE'));
  const goalId = $derived(idFor('GOAL'));
  const personId = $derived(idFor('PERSON'));
  const docId = $derived(idFor('DOC'));
</script>

{#if projectId}
  <ProjectPeek id={projectId} />
{:else if pageId}
  <PagePeek id={pageId} />
{:else if goalId}
  <GoalPeek id={goalId} />
{:else if personId}
  <PersonPeek id={personId} />
{:else if docId}
  <DocPeek id={docId} />
{/if}
