<script lang="ts">
  import ParamSelect from './ParamSelect.svelte';
  import { ARCHIVE_FILTERS } from '$shared/types/enums';
  import { ARCHIVE_FILTER_LABELS, CLOSED_FILTER } from '$shared/utils/archive';

  // List-page toolbar filter. The value lives in `?archived=` so the server load can pass it to `*.list`.
  // With `closedLabel` (Projects, Goals) it also offers closed items (`?archived=closed`), which
  // Active leaves out; the load turns the value into `archived` and `closed` with `statusListFilters`.
  interface Props {
    readonly closedLabel?: string;
  }

  const { closedLabel }: Props = $props();

  const options = $derived(
    closedLabel
      ? [
          { id: 'exclude', name: ARCHIVE_FILTER_LABELS.exclude },
          { id: CLOSED_FILTER, name: closedLabel },
          { id: 'only', name: ARCHIVE_FILTER_LABELS.only },
          { id: 'include', name: 'All' }
        ]
      : ARCHIVE_FILTERS.map((filter) => ({ id: filter, name: ARCHIVE_FILTER_LABELS[filter] }))
  );
</script>

<ParamSelect param="archived" {options} defaultValue="exclude" ariaLabel="Show active or archived" />
