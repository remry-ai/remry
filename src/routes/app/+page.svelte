<script lang="ts">
  import HomeTodos from '$lib/home/components/HomeTodos.svelte';
  import RecentUpdates from '$lib/home/components/RecentUpdates.svelte';
  import FocusGraph from '$lib/home/components/FocusGraph.svelte';
  import UpcomingBirthdays from '$lib/home/components/UpcomingBirthdays.svelte';
  import type { PageData } from './$types';

  const { data } = $props<{ data: PageData }>();
</script>

<svelte:head><title>Home</title></svelte:head>

<div class="page">
  <div class="home-grid">
    <HomeTodos todos={data.todos.items} total={data.todos.total} page={data.todoPage} pageSize={data.todoPageSize} />
    <RecentUpdates updates={data.updates} />
    {#if data.birthdays}<UpcomingBirthdays birthdays={data.birthdays} />{/if}
  </div>
  {#if data.graph.focus}
    <FocusGraph graph={{ ...data.graph, focus: data.graph.focus }} />
  {/if}
</div>

<style lang="scss">
  .home-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-6);
    align-items: start;
    @include below-md { grid-template-columns: 1fr; }
  }
</style>
