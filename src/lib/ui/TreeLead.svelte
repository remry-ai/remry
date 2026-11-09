<script lang="ts">
  import DisclosureButton from './DisclosureButton.svelte';

  // The start of a tree row inside a list (EntityRow's `lead`): the indent for its depth, the └
  // mark under its parent, and the chevron that shows or hides its children (or a spacer), as
  // the wiki and project lists draw their trees.
  interface Props {
    readonly depth: number;
    readonly hasChildren: boolean;
    readonly expanded: boolean;
    /** What the chevron expands, for its accessible name. */
    readonly label: string;
    readonly onToggle: () => void;
  }

  const { depth, hasChildren, expanded, label, onToggle }: Props = $props();
</script>

<span class="tree-lead" style="--depth: {depth}">
  {#if depth > 0}<span class="tree-indent">└</span>{/if}
  {#if hasChildren}
    <DisclosureButton {expanded} {label} {onToggle} />
  {:else}
    <span class="disclosure-spacer"></span>
  {/if}
</span>

<style lang="scss">
  .tree-lead {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-1);
    padding-left: calc(var(--depth) * var(--sp-5));
    margin-right: calc(-1 * var(--sp-1));
    @include mobile {
      padding-left: calc(var(--depth) * var(--sp-3));
      .tree-indent { display: none; }
    }
  }
  .disclosure-spacer {
    width: var(--control-h-sm);
  }
  .tree-indent {
    color: var(--border-strong);
    font-size: var(--fs-sm);
  }
</style>
