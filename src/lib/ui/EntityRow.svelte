<script lang="ts">
  // A `.list-row` that links to an entity: its title link, whatever the list shows beside it
  // (children: a badge, a status, a date), then its `.row-actions`, which start with a peek
  // button. The peek comes from the link (`peekForHref`: a project, wiki page, goal, person or
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
    /** More `.row-actions` after the peek (remove, reorder). */
    readonly actions?: Snippet;
  }

  const { href, label, peek, wrap = false, active = false, linkClass = '', onclick, children, actions }: Props = $props();

  const peeksShown = getContext<boolean | undefined>(PEEKS_CONTEXT) === true;
  const target = $derived(peeksShown ? (peek === undefined ? peekForHref(href) : peek) : null);
</script>

<li class="list-row" class:active>
  <a class="grow {wrap ? 'wrap' : 'truncate'} {linkClass}" {href} {onclick}>{label}</a>
  {@render children?.()}
  {#if target?.type || actions}
    <span class="row-actions">
      {#if target?.type}<PeekButton type={target.type} id={target.id} {label} />{/if}
      {@render actions?.()}
    </span>
  {/if}
</li>
