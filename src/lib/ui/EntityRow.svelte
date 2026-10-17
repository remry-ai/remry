<script lang="ts">
  // A `.list-row` that links to an entity: its title link with a peek button right after it
  // (as on the list pages), whatever the list shows beside it (children: a badge, a status, a
  // date), then its other `.row-actions`. The peek comes from the link (`peekForHref`: a project, wiki page, goal, person or
  // doc) and shows only on a page that shows typed peeks (PEEKS_CONTEXT, set by
  // EntityDetailPage). Every row that links to an entity uses this (a unit test checks), so a
  // new list gets its peek without anyone remembering to add it.
  import { getContext, type Snippet } from 'svelte';
  import PeekButton from './PeekButton.svelte';
  import { peekForHref, PEEKS_CONTEXT, type PeekTarget } from './peek-url';

  interface Props {
    readonly href: string;
    readonly label: string;
    /** What the peek button opens: worked out from `href` when left out; null for none. */
    readonly peek?: PeekTarget | null;
    /** Wrap a long title onto more lines instead of cutting it off (narrow sidebars). */
    readonly wrap?: boolean;
    readonly active?: boolean;
    /** Extra classes for the title link. */
    readonly linkClass?: string;
    /** Handles a click on the title (DocsManager opens the doc in place). */
    readonly onclick?: (e: MouseEvent) => void;
    /** Shown between the title and the actions. */
    readonly children?: Snippet;
    /** Small text on a line of its own under the title (a relation's note). */
    readonly detail?: Snippet;
    /** More `.row-actions` after the peek (remove, reorder). */
    readonly actions?: Snippet;
  }

  const { href, label, peek, wrap = false, active = false, linkClass = '', onclick, children, detail, actions }: Props = $props();

  const peeksShown = getContext<boolean | undefined>(PEEKS_CONTEXT) === true;
  const target = $derived(peeksShown ? (peek === undefined ? peekForHref(href) : peek) : null);
</script>

<li class="list-row" class:active>
  <span class="grow main">
    <span class="title-line">
      <a class="{wrap ? 'wrap' : 'truncate'} {linkClass}" {href} {onclick}>{label}</a>
      {#if target?.type}<span class="row-actions"><PeekButton type={target.type} id={target.id} {label} /></span>{/if}
    </span>
    {@render detail?.()}
  </span>
  {@render children?.()}
  {#if actions}<span class="row-actions">{@render actions()}</span>{/if}
</li>

<style lang="scss">
  .main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  // The title takes only its width, so the peek sits right after it; a long one still
  // truncates or wraps rather than pushing the peek out.
  .title-line {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    max-width: 100%;
    a { min-width: 0; }
    .row-actions { flex-shrink: 0; }
  }
</style>
