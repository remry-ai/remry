<script lang="ts">
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ArchiveFilter from '$lib/ui/ArchiveFilter.svelte';
  import ParamToggle from '$lib/ui/ParamToggle.svelte';
  import FocusGraph from '$lib/home/components/FocusGraph.svelte';
  import PersonForm from '$lib/person/components/PersonForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { model } from '$lib/stores/notebook-model';
  import { fieldText } from '$lib/person/fields';
  import type { PersonSummary } from '$shared/types/person';

  const { data } = $props<{ data: PageData }>();
  const persons = $derived((data.persons.ok ? data.persons.value : []) as readonly PersonSummary[]);
  // Each column a module adds (Title and Lead, or How we know them and Birthday).
  const fields = $derived($model.personFields);
  // How each person relates to you, once someone is marked as you.
  const hasMe = $derived(persons.some((p) => p.isMe));

  const handleCreated = () => closePopup({ invalidate: true });

  // A home notebook opens on the graph (centred on you), a work notebook on the table.
  const VIEW_OPTIONS = [
    { id: 'graph', name: 'Graph' },
    { id: 'table', name: 'Table' }
  ];
  const graph = $derived(data.view === 'graph' ? data.graph : null);
</script>

<svelte:head><title>People</title></svelte:head>

<div class="page">
  <PageHeader title="People" description="Everyone in this notebook. Groups (teams, family, friends) are on the Groups page.">
    <a class="btn" href="/app/people/kinds">Relation kinds</a>
    <button type="button" class="btn primary" onclick={() => openPopup('new-person')}>Add person</button>
  </PageHeader>

  <div class="toolbar filters">
    {#if data.view === 'table'}<ArchiveFilter />{/if}
    <span class="spacer"></span>
    <ParamToggle param="view" options={VIEW_OPTIONS} defaultValue={data.defaultView} ariaLabel="View" />
  </div>

  {#if data.view === 'graph' && persons.length > 0}
    {#if graph?.focus}
      <FocusGraph graph={{ ...graph, focus: graph.focus }} />
    {:else}
      <EmptyState message="Nothing to show here." boxed />
    {/if}
  {:else if persons.length > 0}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            {#if hasMe}<th>To you</th>{/if}
            {#each fields as f (`${f.module}.${f.key}`)}<th>{f.label}</th>{/each}
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {#each persons as person (person.id)}
            <tr>
              <td><a href={person.path}>{person.name}</a>{#if person.isMe} <span class="badge accent">You</span>{/if}{#if person.archivedAt} <span class="badge muted">Archived</span>{/if}</td>
              {#if hasMe}<td class="text-2">{person.toMe.join(', ')}</td>{/if}
              {#each fields as f (`${f.module}.${f.key}`)}<td class="text-2">{fieldText(person.extensions, f) ?? ''}</td>{/each}
              <td class="text-2">{person.email ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <EmptyState message="No people yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-person')}>Add person</button>
    </EmptyState>
  {/if}
</div>

<Popup id="new-person" title="Add person">
  <PersonForm personOptions={persons} onSuccess={handleCreated} onCancel={() => closePopup()} />
</Popup>
