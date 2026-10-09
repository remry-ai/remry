<script lang="ts">
  import ParamSelect from './ParamSelect.svelte';
  import { ARCHIVE_FILTERS } from '$shared/types/enums';
  import { ARCHIVE_FILTER_LABELS } from '$shared/utils/archive';

  // List-page toolbar filter. The value lives in `?archived=` so the server load can pass it to `*.list`.
  const options = ARCHIVE_FILTERS.map((filter) => ({ id: filter, name: ARCHIVE_FILTER_LABELS[filter] }));
</script>

<ParamSelect param="archived" {options} defaultValue="exclude" ariaLabel="Show active or archived" />
