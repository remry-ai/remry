<script lang="ts">
  // A chevron pointing right, inheriting currentColor. Rotate it from the
  // parent (90deg for open). Pair with an aria-label on the button.
  interface Props {
    readonly size?: number;
  }

  const { size = 14 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m6 3.5 4.5 4.5L6 12.5" />
</svg>
