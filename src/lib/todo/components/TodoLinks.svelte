<script lang="ts">
  // The todo form's links. A saved todo shows its relations, added and removed
  // straight away; a new one collects picks in `pending`, which TodoForm adds
  // once the todo is created.
  import { trpc } from '$shared/trpc/client';
  import type { RelationGroup } from '$shared/types/relations';
  import type { PickedLink } from '$shared/utils/relations';
  import RelationsWidget from '$lib/relation/components/RelationsWidget.svelte';
  import AddRelation from '$lib/relation/components/AddRelation.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { submit } from '$lib/ui/submit';

  interface Props {
    /** The saved todo, or null while it's being created. */
    readonly todoId: string | null;
    pending?: readonly PickedLink[];
  }

  let { todoId, pending = $bindable([]) }: Props = $props();

  let groups = $state<readonly RelationGroup[]>([]);
  let adding = $state(false);
  let loadError = $state('');

  const load = async (id: string | null = todoId) => {
    if (!id) return;
    const outcome = await submit(() => trpc().relation.forEntity.query({ entityType: 'TODO', entityId: id }));
    if (outcome.ok) {
      // Over tRPC, without a transformer, dates arrive as strings.
      groups = outcome.value.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, createdAt: new Date(i.createdAt) })) }));
      loadError = '';
    } else {
      loadError = outcome.error;
    }
  };

  $effect(() => {
    void load(todoId);
  });

  const sameLink = (a: PickedLink, b: PickedLink) =>
    a.choice === b.choice && a.target.entityType === b.target.entityType && a.target.entityId === b.target.entityId;

  const addPending = (link: PickedLink) => {
    if (!pending.some((p) => sameLink(p, link))) pending = [...pending, link];
  };

  const dropPending = (link: PickedLink) => {
    pending = pending.filter((p) => !sameLink(p, link));
  };
</script>

{#if todoId}
  <RelationsWidget entityType="TODO" entityId={todoId} {groups} onChange={() => load()} />
  {#if loadError}<p class="form-error">{loadError}</p>{/if}
{:else}
  <div>
    <div class="section-header">
      <h4>Related <span class="count">{pending.length}</span></h4>
      <button
        type="button"
        class="btn icon sm"
        onclick={() => (adding = !adding)}
        title="Add link"
        aria-label="Add link"
        aria-expanded={adding}
      >+</button>
    </div>
    {#if adding}
      <AddRelation self={null} onPickLink={addPending} onDone={() => (adding = false)} />
    {/if}
    {#if pending.length === 0}
      {#if !adding}<EmptyState message="Nothing linked yet." small />{/if}
    {:else}
      <ul class="list">
        {#each pending as link (`${link.choice}:${link.target.entityType}:${link.target.entityId}`)}
          <li class="list-row">
            <span class="grow truncate">{link.name}</span>
            <span class="meta">{link.choiceName}</span>
            <span class="row-actions">
              <button type="button" class="btn icon sm" aria-label="Don't link {link.name}" title="Don't link" onclick={() => dropPending(link)}>&times;</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
