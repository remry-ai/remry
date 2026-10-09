<script lang="ts">
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import EntityDetailPage from '$lib/common/EntityDetailPage.svelte';
  import PersonForm from '$lib/person/components/PersonForm.svelte';
  import InlinePicker from '$lib/ui/InlinePicker.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';
  import OwnedWork from '$lib/goal/components/OwnedWork.svelte';
  import { model } from '$lib/stores/notebook-model';
  import { fieldPatch, fieldText } from '$lib/person/fields';
  import type { PersonDetail } from '$shared/types/person';
  import type { GroupSummary } from '$shared/types/groups';
  import type { PersonFieldDescriptor } from '$shared/modules/types';

  const { data } = $props<{ data: PageData }>();
  const person = $derived(data.person as PersonDetail);
  const docs = $derived(data.docs);
  const notes = $derived(data.notes);
  const todos = $derived(data.todos);
  const reports = $derived(data.reports);
  const relations = $derived(data.relations);

  const personOptions = $derived(data.allPersons.filter((p: { id: string }) => p.id !== person.id));
  // Groups to join, under their kind (Teams, Families), leaving out the ones they're in.
  const groupOptions = $derived(
    (data.allGroups as readonly GroupSummary[])
      .filter((g) => !person.groups.some((m) => m.id === g.id))
      .map((g) => ({ id: g.id, name: g.name, group: g.kindName }))
  );
  const reports_ = $derived(person.extensions.org?.reports ?? []);

  const setField = async (field: PersonFieldDescriptor, value: string | null) => {
    await submitOrThrow(() => trpc().person.update.mutate({ id: person.id, extensions: fieldPatch(field, value) }));
    await invalidateAll();
  };

  // "Me" is the notebook's owner; relations to them read as "To you" on People.
  let meError = $state('');
  const handleSetMe = async (id: string | null) => {
    meError = '';
    const outcome = await submit(() => trpc().person.setMe.mutate({ id }));
    if (!outcome.ok) meError = outcome.error;
    else await invalidateAll();
  };

  const handleJoin = async (groupId: string) => {
    await submitOrThrow(() => trpc().group.addMember.mutate({ groupId, personId: person.id }));
    await invalidateAll();
  };

  const handleLeave = async (groupId: string) => {
    await submitOrThrow(() => trpc().group.removeMember.mutate({ groupId, personId: person.id }));
    await invalidateAll();
  };
</script>

<EntityDetailPage
  entityType="PERSON"
  entityId={person.id}
  archivedAt={person.archivedAt}
  entityName={person.name}
  breadcrumbLabel="People"
  breadcrumbHref="/app/people"
  editPopupTitle="Edit person"
  {docs}
  {notes}
  {todos}
  {reports}
  {relations}
  links={data.links}
>
  {#snippet renderMeta()}
    <dl class="meta-list">
      <div>
        <dt>Email</dt>
        <dd>{#if person.email}<a href="mailto:{person.email}">{person.email}</a>{:else}<span class="muted">—</span>{/if}</dd>
      </div>
      <div>
        <dt>To you</dt>
        <dd>
          {#if person.isMe}
            <span class="badge accent">You</span>
            <button type="button" class="btn link sm" onclick={() => handleSetMe(null)}>Not me</button>
          {:else}
            {#if person.toMe.length > 0}{person.toMe.join(', ')}{:else}<span class="muted">—</span>{/if}
            <button type="button" class="btn link sm" onclick={() => handleSetMe(person.id)}>This is me</button>
          {/if}
          {#if meError}<span class="inline-error">{meError}</span>{/if}
        </dd>
      </div>
      {#each $model.personFields as field (`${field.module}.${field.key}`)}
        {@const text = fieldText(person.extensions, field)}
        <div>
          <dt>{field.label}</dt>
          <dd>
            {#if field.input === 'person'}
              {#if text && person.extensions.org?.leadId}
                <a href="/app/people/{person.extensions.org.leadId}">{text}</a>
                <ConfirmButton label="Unassign" confirmLabel="Unassign {field.label.toLowerCase()}" onConfirm={() => setField(field, null)} />
              {:else}
                <InlinePicker label="Assign {field.label.toLowerCase()}" options={personOptions} placeholder="Select a person…" onPick={(id) => setField(field, id)} />
              {/if}
            {:else}
              {#if text}{text}{:else}<span class="muted">—</span>{/if}
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
  {/snippet}

  {#snippet renderOverview()}
    {#if $model.has('org')}
      <section class="section">
        <div class="section-header">
          <h4>Direct reports <span class="count">{reports_.length}</span></h4>
        </div>
        {#if reports_.length > 0}
          <ul class="list">
            {#each reports_ as r (r.id)}
              <li class="list-row">
                <a class="grow truncate" href="/app/people/{r.id}">{r.name}</a>
                {#if r.title}<span class="meta">{r.title}</span>{/if}
              </li>
            {/each}
          </ul>
        {:else}
          <EmptyState message="No direct reports." />
        {/if}
      </section>
    {/if}

    <section class="section">
      <div class="section-header">
        <h4>Groups <span class="count">{person.groups.length}</span></h4>
      </div>
      {#if person.groups.length > 0}
        <ul class="list">
          {#each person.groups as g (g.id)}
            <li class="list-row">
              <a class="grow truncate" href={g.path}>{g.name}</a>
              <span class="meta">{g.kindName}</span>
              <span class="row-actions">
                <ConfirmButton label="Leave {g.name}" variant="icon" onConfirm={() => handleLeave(g.id)} />
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="Not in any group." />
      {/if}
      <div class="section-footer">
        <InlinePicker label="Add to group" options={groupOptions} placeholder="Select a group…" onPick={handleJoin} />
      </div>
    </section>

    <OwnedWork goals={data.ownedGoals} projects={data.ownedProjects} />
  {/snippet}

  {#snippet renderAssetHeader()}
    {@const subtitle = $model.personFields.filter((f) => f.input === 'text').map((f) => fieldText(person.extensions, f)).find(Boolean)}
    <span class="asset-h-name">{person.name}</span>
    {#if subtitle}<span class="asset-h-meta">{subtitle}</span>{/if}
  {/snippet}

  {#snippet renderEditForm({ onSuccess, onCancel })}
    <PersonForm initial={person} {personOptions} {onSuccess} {onCancel} />
  {/snippet}
</EntityDetailPage>

<style lang="scss">
  .section-footer { margin-top: var(--sp-2); }
</style>
