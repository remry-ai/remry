<script lang="ts">
  // A home notebook's birthdays in the next month, soonest first.
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { formatBirthday } from '$shared/utils/birthday';

  interface Birthday {
    readonly id: string;
    readonly name: string;
    readonly birthday: string;
    readonly inDays: number;
    readonly turns: number | null;
  }

  interface Props {
    readonly birthdays: readonly Birthday[];
  }

  const { birthdays }: Props = $props();

  const when = (inDays: number): string => (inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : `In ${inDays} days`);
</script>

<section class="card panel">
  <header class="section-header"><h2>Upcoming birthdays <span class="count">{birthdays.length}</span></h2></header>
  {#if birthdays.length === 0}
    <EmptyState message="No birthdays in the next month." />
  {:else}
    <ul class="list divided">
      {#each birthdays as b (b.id)}
        <li class="list-row">
          <a class="grow truncate" href="/app/people/{b.id}">{b.name}</a>
          <span class="meta">{formatBirthday(b.birthday.replace(/^\d{4}-/, '--'))}{#if b.turns !== null} · turns {b.turns}{/if}</span>
          <span class="badge" class:accent={b.inDays <= 7}>{when(b.inDays)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style lang="scss">
  h2 { font-size: var(--fs-base); }
</style>
