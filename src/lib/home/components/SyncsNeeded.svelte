<script lang="ts">
  // Sync docs and pages that want syncing: the last sync failed, it never ran, or it's over a
  // week old (sync.needed). Hidden when there are none, so it only shows when there's something to do.
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import { SYNC_NEED_LABELS } from '$shared/utils/sync-state';
  import type { SyncNeed } from '$shared/types/sync-now';
  import { timeAgo } from '$lib/home/utils';

  interface SyncNeeded {
    readonly entityType: 'DOC' | 'PAGE';
    readonly id: string;
    readonly title: string;
    readonly path: string;
    readonly on: { readonly label: string; readonly path: string } | null;
    readonly need: SyncNeed;
    readonly lastSync: { readonly at: Date | string; readonly message: string | null } | null;
  }

  interface Props {
    readonly syncs: readonly SyncNeeded[];
  }

  const { syncs }: Props = $props();

  /** The rows shown; the count says how many there are in all. */
  const SHOWN = 8;
  const shown = $derived(syncs.slice(0, SHOWN));

  const detail = (s: SyncNeeded): string => {
    const where = s.on ? `On ${s.on.label}` : 'Wiki page';
    return s.lastSync ? `${where} · ${timeAgo(s.lastSync.at)}` : where;
  };
</script>

{#if syncs.length > 0}
  <section class="card panel">
    <header class="section-header">
      <h2>Sync docs out of date <span class="count">{syncs.length}</span></h2>
    </header>
    <ul class="list divided">
      {#each shown as s (`${s.entityType}:${s.id}`)}
        <EntityRow href={s.path} label={s.title} wrap>
          <span class="meta">{detail(s)}</span>
          <span class="badge" class:danger={s.need === 'failed'} class:warning={s.need !== 'failed'} title={s.need === 'failed' && s.lastSync?.message ? s.lastSync.message : undefined}>{SYNC_NEED_LABELS[s.need]}</span>
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
