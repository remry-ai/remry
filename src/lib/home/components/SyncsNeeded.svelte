<script lang="ts">
  // Sync docs and pages that want syncing: the last sync failed, it never ran, or it's over a
  // week old (sync.needed). Hidden when there are none, so it only shows when there's something to do.
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import SyncStatus from '$lib/link/components/SyncStatus.svelte';
  import { syncStatus, syncNeedTone, type LastSyncView } from '$lib/link/last-sync';
  import type { SyncNeed } from '$shared/types/sync-now';

  interface SyncNeeded {
    readonly entityType: 'DOC' | 'PAGE';
    readonly id: string;
    readonly title: string;
    readonly path: string;
    readonly on: { readonly label: string; readonly path: string } | null;
    readonly need: SyncNeed;
    readonly lastSync: LastSyncView | null;
  }

  interface Props {
    readonly syncs: readonly SyncNeeded[];
  }

  const { syncs }: Props = $props();

  /** The rows shown; the count says how many there are in all. */
  const SHOWN = 8;
  const shown = $derived(syncs.slice(0, SHOWN));

  const statusOf = (s: SyncNeeded) => ({ ...syncStatus(s.lastSync), tone: syncNeedTone(s.need) });
</script>

{#if syncs.length > 0}
  <section class="card panel">
    <header class="section-header">
      <h2>Sync docs out of date <span class="count">{syncs.length}</span></h2>
    </header>
    <ul class="list divided">
      {#each shown as s (`${s.entityType}:${s.id}`)}
        <EntityRow href={s.path} label={s.title} wrap>
          {#if s.on}<span class="meta">{s.on.label}</span>{/if}
          <SyncStatus {...statusOf(s)} />
        </EntityRow>
      {/each}
    </ul>
    {#if syncs.length > SHOWN}<p class="text-xs text-2 more">And {syncs.length - SHOWN} more.</p>{/if}
  </section>
{/if}

<style lang="scss">
  h2 { font-size: var(--fs-base); }
  .more { margin: var(--sp-2) 0 0; }
</style>
