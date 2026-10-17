<script lang="ts">
  // Changes a link's kind (as it reads from this side, keeping its ends) and its note, or
  // removes it. The sentence on top reads the link as picked ("Jim is partner of Marie"), and
  // picking a kind a person can have only one of (a lead) warns that it replaces theirs.
  // RelationsWidget shows it in a popup, or in place inside the todo popup. ⌘↵ saves.
  import { onMount } from 'svelte';
  import { trpc } from '$shared/trpc/client';
  import type { RelationItem } from '$shared/types/relations';
  import type { PersonRelationKindDefinition } from '$shared/types/person-relations';
  import { editKindOptions, linkPredicate, replacesWarning } from '$shared/utils/relations';
  import { submit } from '$lib/ui/submit';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';

  interface Props {
    readonly item: RelationItem;
    /** The entity the link is on, for the sentence: "Jim". */
    readonly selfLabel: string;
    /** Runs after a save. */
    readonly onSaved: () => Promise<void> | void;
    /** Removes the link (throws to show an error). */
    readonly onRemove: () => Promise<void>;
    readonly onCancel: () => void;
  }

  const { item, selfLabel, onSaved, onRemove, onCancel }: Props = $props();

  let personKinds = $state<readonly PersonRelationKindDefinition[]>([]);
  const options = $derived(editKindOptions(item, personKinds));

  // svelte-ignore state_referenced_locally
  let kind = $state(item.kind);
  // svelte-ignore state_referenced_locally
  let note = $state(item.note ?? '');
  let saving = $state(false);
  let error = $state('');
  let form = $state<HTMLFormElement>();

  const changed = $derived(kind !== item.kind || note.trim() !== (item.note ?? ''));
  const kindName = $derived(options.find((o) => o.kind === kind)?.name ?? item.label);

  const replaces = $derived(kind === item.kind
    ? null
    : replacesWarning(personKinds.find((k) => k.key === kind), item.direction, selfLabel, item.other.label ?? 'They'));

  onMount(async () => {
    if (!item.personRelation) return;
    const listed = await trpc().personRelationKind.list.query();
    if (listed.ok) personKinds = listed.value;
  });

  const handleSave = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!changed || saving) return;
    saving = true;
    error = '';
    const input = {
      id: item.id,
      ...(kind !== item.kind && { kind }),
      note: note.trim() || null
    };
    const outcome = await submit(() => item.personRelation
      ? trpc().personRelation.update.mutate(input)
      : trpc().relation.update.mutate({ ...input, kind: input.kind as 'RELATED' | 'DEPENDS_ON' | undefined }));
    saving = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    await onSaved();
  };

  const handleNoteKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form?.requestSubmit();
    }
  };
</script>

<form class="relation-edit" bind:this={form} onsubmit={handleSave}>
  <p class="sentence">
    <strong>{selfLabel}</strong> {linkPredicate(kindName)} <strong>{item.other.label}</strong>
  </p>
  <Field label="Link" hint={replaces ?? undefined}>
    {#snippet children({ id })}
      <select {id} bind:value={kind}>
        {#if !options.some((o) => o.kind === item.kind)}<option value={item.kind}>{item.label}</option>{/if}
        {#each options as o (o.kind)}<option value={o.kind}>{o.name}</option>{/each}
      </select>
    {/snippet}
  </Field>
  <Field label="Note" hint="⌘↵ to save">
    {#snippet children({ id })}
      <textarea {id} bind:value={note} rows="3" maxlength="1000" placeholder="How they're linked" onkeydown={handleNoteKeydown}></textarea>
    {/snippet}
  </Field>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={saving || !changed} aria-busy={saving}>{saving ? 'Saving…' : 'Save'}</button>
    <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    <span class="ml-auto"><ConfirmButton label="Remove link" variant="button" onConfirm={onRemove} /></span>
  </div>
</form>

<style lang="scss">
  .relation-edit {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .sentence { margin: 0; }
</style>
