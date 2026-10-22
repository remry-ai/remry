<script lang="ts">
  import ParamSelect from './ParamSelect.svelte';
  import { ARCHIVE_FILTERS } from '$shared/types/enums';
  import { ARCHIVE_FILTER_LABELS, DONE_FILTER } from '$shared/utils/archive';

  // List-page toolbar filter. The value lives in `?archived=` so the server load can pass it to `*.list`.
  // With `done` (lists whose rows have a status), it also offers Done, and Active leaves done rows out
  // (`doneShown` in `$shared/utils/archive`).
  interface Props {
    readonly done?: boolean;
  }

  const { done = false }: Props = $props();

  const options = $derived(
    done
      ? [
          { id: 'exclude', name: ARCHIVE_FILTER_LABELS.exclude },
          { id: DONE_FILTER, name: 'Done' },
          { id: 'only', name: ARCHIVE_FILTER_LABELS.only },
          { id: 'include', name: 'All' }
        ]
      : ARCHIVE_FILTERS.map((filter) => ({ id: filter, name: ARCHIVE_FILTER_LABELS[filter] }))
  );
</script>

<ParamSelect param="archived" {options} defaultValue="exclude" ariaLabel="Show active, done or archived" />
