<script lang="ts">
  import type { RecentUpdate, UpdateKind } from '$shared/types/home';
  import { timeAgo } from '../utils';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';

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
            {#if u.content}
              <!-- A note has no title: its markdown, a few lines of it, with its own links. -->
              <div class="note-body"><MarkdownRenderer content={u.content} zoomable={false} /></div>
            {:else}
              <a href={u.href} class="title wrap">{u.title}</a>
            {/if}
            <div class="update-meta">
              <span class="wrap">{`${u.isNew ? 'added' : 'updated'}${u.parentLabel ? ' on ' : ''}`}{#if u.parentLabel}{#if u.parentHref}<a class="parent" href={u.parentHref}>{u.parentLabel}</a>{:else}{u.parentLabel}{/if}{/if}</span>
              {#if u.content}
                <a class="time" href={u.href} title="Open note"><time datetime={new Date(u.at).toISOString()}>{timeAgo(u.at)}</time></a>
              {:else}
                <time datetime={new Date(u.at).toISOString()}>{timeAgo(u.at)}</time>
              {/if}
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
  // Wraps instead of overflowing: a long parent name takes more lines, and the time keeps its place.
  // Not `.meta`, which a list row keeps on one line (_layout.scss).
  .update-meta {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    font-size: var(--fs-sm);
    color: var(--text-3);
    span { min-width: 0; }
    time { white-space: nowrap; }
    > time, .time { margin-left: auto; flex-shrink: 0; }
    .time { color: inherit; &:hover { color: var(--accent); } }
  }
  // About four lines of a note; the rest is on its page.
  .note-body {
    max-height: 6.5em;
    overflow: hidden;
    font-size: var(--fs-md);
    :global(.md-rendered > :first-child) { margin-top: 0; }
    :global(.md-rendered > :last-child) { margin-bottom: 0; }
  }
  .parent {
    color: var(--text-2);
    &:hover { color: var(--accent); }
  }
</style>
