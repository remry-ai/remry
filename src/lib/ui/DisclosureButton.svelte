<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronIcon from '$lib/ui/ChevronIcon.svelte';

  // The chevron that shows or hides a row's children, or — with `children` — a
  // whole heading that toggles what sits under it.
  interface Props {
    readonly expanded: boolean;
    /** What the button expands, for its accessible name ("Expand <label>"). */
    readonly label: string;
    readonly onToggle: () => void;
    /** The label, rendered beside the chevron so it toggles too. Wrap the
     component in the heading rather than passing one. */
    readonly children?: Snippet;
  }

  const { expanded, label, onToggle, children }: Props = $props();
</script>

<button
  type="button"
  class={children ? 'disclosure labelled' : 'btn icon sm disclosure'}
  class:open={expanded}
  aria-expanded={expanded}
  aria-label="{expanded ? 'Collapse' : 'Expand'} {label}"
  onclick={onToggle}
>
  <span class="chevron" aria-hidden="true"><ChevronIcon /></span>
  {#if children}{@render children()}{/if}
</button>

<style lang="scss">
  .chevron {
    display: inline-flex;
    transition: transform var(--ease);
  }
  .disclosure.open .chevron { transform: rotate(90deg); }

  .labelled {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    // A button doesn't inherit these from the heading it sits in: the UA
    // stylesheet resets them on form controls.
    text-transform: inherit;
    letter-spacing: inherit;
    .chevron { color: var(--text-3); }
    &:hover .chevron { color: var(--text); }
  }
</style>
