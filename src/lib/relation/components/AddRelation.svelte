<script lang="ts">
  // The Related section's add form: how the link reads from this side
  // ("Related to", "Depends on", "Needed by", and on a person's page the
  // notebook's person relation kinds), then search for the other entity.
  // A person relation kind links to people only and goes to personRelation.add. Picking one adds the link, or, for an entity that isn't saved yet
  // (a new todo), hands it to `onPickLink` for the form to add once it saves.
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import { loadEntityOptions, type EntityOption } from '$shared/trpc/load-entity-options';
  import { RELATABLE_TYPES } from '$shared/types/enums';
  import { ENTITY_SEARCH_SCOPES, parseTypedIdValue } from '$shared/utils/entity';
  import { isPersonChoice, relationChoices, toPersonRelationInput, toRelationInput, type PickedLink, type RelationEnd } from '$shared/utils/relations';
  import type { PersonRelationKindDefinition } from '$shared/types/person-relations';
  import SearchPicker from '$lib/ui/SearchPicker.svelte';
  import { errorMessage, submitOrThrow } from '$lib/ui/submit';
  import { model } from '$lib/stores/notebook-model';

  interface Props {
    /** The entity the link is on; null while it's still being created (pass `onPickLink`). */
    readonly self: RelationEnd | null;
    /** Takes the picked link instead of adding it. */
    readonly onPickLink?: (link: PickedLink) => void;
    /** Runs after a link is added. */
    readonly onChange?: () => Promise<void> | void;
    readonly onDone: () => void;
  }

  const { self, onPickLink, onChange, onDone }: Props = $props();

  // The notebook's person relation kinds (Parent of, Lead of), offered on a person's page.
  let kinds = $state<readonly PersonRelationKindDefinition[]>([]);
  const isPerson = $derived(self?.entityType === 'PERSON');
  const choices = $derived(relationChoices(kinds, self?.entityType ?? null));

  let choice = $state('RELATED:out');
  let options = $state<readonly EntityOption[]>([]);
  // A home notebook leaves goals and departments out.
  const shown = $derived(options.filter((o) => $model.shows(o.scope)));
  let loading = $state(true);
  let loadError = $state('');

  onMount(async () => {
    try {
      const [loaded, listed] = await Promise.all([
        loadEntityOptions(trpc(), self),
        isPerson ? trpc().personRelationKind.list.query() : Promise.resolve(null)
      ]);
      options = loaded;
      if (listed?.ok) kinds = listed.value;
    } catch (e: unknown) {
      loadError = errorMessage(e);
    } finally {
      loading = false;
    }
  });

  const handlePick = async (id: string) => {
    const parsed = parseTypedIdValue(id, RELATABLE_TYPES);
    const target = parsed ? { entityType: parsed.type, entityId: parsed.id } : null;
    if (target && onPickLink) {
      const name = options.find((o) => o.id === id)?.name ?? '';
      onPickLink({ choice, choiceName: choices.find((c) => c.id === choice)?.name ?? '', target, name });
      onDone();
      return;
    }
    if (isPersonChoice(choice)) {
      const input = target && self && target.entityType === 'PERSON' ? toPersonRelationInput(choice, self.entityId, target.entityId, kinds) : null;
      if (!input) throw new Error('Choose a person.');
      await submitOrThrow(() => trpc().personRelation.add.mutate(input));
    } else {
      const input = target && self ? toRelationInput(choice, self, target) : null;
      if (!input) throw new Error('Choose what to link to.');
      await submitOrThrow(() => trpc().relation.add.mutate(input));
    }
    onDone();
    await onChange?.();
    await invalidateAll();
  };
</script>

<div class="add-relation">
  <select class="sm" bind:value={choice} aria-label="How it's linked">
    {#each choices as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
  </select>
  <SearchPicker label="Link to" options={isPersonChoice(choice) ? options.filter((o) => o.id.startsWith('PERSON:')) : shown} scopes={ENTITY_SEARCH_SCOPES.filter((s) => $model.shows(s.id))} {loading} onPick={handlePick} onCancel={onDone} />
  {#if loadError}<span class="inline-error" role="alert">{loadError}</span>{/if}
</div>

<style lang="scss">
  .add-relation {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-bottom: var(--sp-2);
  }
</style>
