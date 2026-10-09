<script lang="ts">
  import type { RecentUpdate, UpdateKind } from '$shared/types/home';
  import { timeAgo } from '../utils';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  interface Props {
    readonly updates: readonly RecentUpdate[];
  }

  const { updates }: Props = $props();

  const kindLabel = (k: UpdateKind): string => k.charAt(0) + k.slice(1).toLowerCase();
</script>

<section class="card panel">
  <header class="section-header"><h2>Latest updates</h2></header>

  {#if updates.length === 0}
    <EmptyState message="No activity yet." />
  {:else}
    <ul class="list divided">
      {#each updates as u (`${u.kind}:${u.id}`)}
        <li class="list-row update-row">
          <span class="badge muted kind">{kindLabel(u.kind)}</span>
          <div class="body">
            <a href={u.href} class="title truncate">{u.title}</a>
            <div class="meta">
              <span>{u.isNew ? 'added' : 'updated'}{#if u.parentLabel} on {u.parentLabel}{/if}</span>
              <time datetime={new Date(u.at).toISOString()}>{timeAgo(u.at)}</time>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style lang="scss">
  h2 { font-size: var(--fs-base); }
  .update-row {
    align-items: flex-start;
    padding: var(--sp-2) 0;
  }
  .kind { width: 68px; justify-content: center; margin-top: 1px; }
  .body { min-width: 0; flex: 1; }
  .title {
    display: block;
    font-size: var(--fs-md);
    font-weight: 500;
    color: var(--text);
    &:hover { color: var(--accent); text-decoration: none; }
  }
  .meta {
    display: flex;
    gap: var(--sp-2);
    font-size: var(--fs-sm);
    color: var(--text-3);
    time { margin-left: auto; white-space: nowrap; }
  }
</style>
