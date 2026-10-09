<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import GroupedOptions from './GroupedOptions.svelte';

  // List-page toolbar select whose value lives in one query parameter. Picking
  // `defaultValue` removes the parameter; an unknown value shows as the default.
  interface Option {
    readonly id: string;
    readonly name: string;
    readonly group?: string;
  }

  interface Props {
    readonly param: string;
    readonly options: readonly Option[];
    readonly defaultValue: string;
    readonly ariaLabel: string;
  }

  const { param, options, defaultValue, ariaLabel }: Props = $props();

  const current = $derived.by(() => {
    const value = page.url.searchParams.get(param);
    return value !== null && options.some((option) => option.id === value) ? value : defaultValue;
  });

  const handleChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value;
    const url = new URL(page.url);
    if (value === defaultValue) url.searchParams.delete(param);
    else url.searchParams.set(param, value);
    void goto(url, { keepFocus: true, noScroll: true, replaceState: true });
  };
</script>

<select class="sm" value={current} onchange={handleChange} aria-label={ariaLabel}>
  <GroupedOptions {options} />
</select>
