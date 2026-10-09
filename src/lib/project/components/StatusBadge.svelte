<script lang="ts">
  // A project's status as a badge: its label ("in progress") in its colour.
  import { projectStatusLabel } from '$shared/utils/project-status';
  import { statusBadgeClass } from '../utils';

  interface Props {
    readonly status: string | null | undefined;
  }

  const { status }: Props = $props();
</script>

{#if status}<span class={statusBadgeClass(status)}>{projectStatusLabel(status)}</span>{/if}
