<script lang="ts">
  // The <option>s for a <select>, wrapped in <optgroup>s when options carry a
  // group. Groups keep the order they first appear in.
  interface Option {
    readonly id: string;
    readonly name: string;
    readonly group?: string;
  }

  interface Props {
    readonly options: readonly Option[];
  }

  const { options }: Props = $props();

  const groups = $derived.by(() => {
    const byGroup = new Map<string, Option[]>();
    for (const option of options) {
      const key = option.group ?? '';
      byGroup.set(key, [...(byGroup.get(key) ?? []), option]);
    }
    return [...byGroup.entries()];
  });
</script>

{#each groups as [group, items] (group)}
  {#if group}
    <optgroup label={group}>
      {#each items as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
    </optgroup>
  {:else}
    {#each items as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
  {/if}
{/each}
