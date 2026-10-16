<script lang="ts">
  // The peek affordance in a detail page's row: opens the item in the right panel's Peek tab
  // (`?peek=<TYPE>:<id>`, shown by common/EntityPeek). Put it in the row's `.row-actions`.
  import PeekIcon from './PeekIcon.svelte';
  import { openPeek, peekValue, type PeekType } from './peek-url';

  interface Props {
    readonly type: PeekType;
    readonly id: string;
    /** The item's name, for the button's label. */
    readonly label: string;
  }

  const { type, id, label }: Props = $props();
</script>

<button type="button" class="btn icon sm" aria-label="Peek at {label}" title="Peek" onclick={() => openPeek(peekValue(type, id))}><PeekIcon /></button>
