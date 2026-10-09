<script lang="ts">
  import { page } from '$app/state';

  // Buttons joined into one control, for switching a page between views whose
  // choice lives in one query parameter (`?view=map`). Like ParamSelect, the
  // default removes the parameter and an unknown value shows as the default.
  // Each button is a link, so it works before hydration and opens in a new tab.
  interface Option {
    readonly id: string;
    readonly name: string;
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

  const hrefFor = (value: string): string => {
    const url = new URL(page.url);
    if (value === defaultValue) url.searchParams.delete(param);
    else url.searchParams.set(param, value);
    return `${url.pathname}${url.search}`;
  };
</script>

<div class="segmented" role="group" aria-label={ariaLabel} data-sveltekit-noscroll data-sveltekit-keepfocus data-sveltekit-replacestate>
  {#each options as option (option.id)}
    <a class="btn sm" href={hrefFor(option.id)} aria-current={option.id === current ? 'true' : undefined}>{option.name}</a>
  {/each}
</div>
