<script lang="ts">
  // The mark for a Remry Pro feature: a small sparkle beside a control, linking nowhere, with
  // "Remry Pro" (or `label`) as its tooltip and accessible name. By default it shows only while
  // the license isn't active (the /app layout loads it as `license`); `show` decides instead,
  // as for drawings, which are locked only once the free ones are used.
  import { page } from '$app/state';
  import { isProActive, type LicenseStatus } from '$shared/types/license';

  interface Props {
    /** Whether to show it; by default, while there's no active license. */
    readonly show?: boolean;
    /** Tooltip and accessible name. */
    readonly label?: string;
  }

  const { show, label = 'Part of Remry Pro' }: Props = $props();

  const license = $derived(page.data?.license as LicenseStatus | undefined);
  const visible = $derived(show ?? (license !== undefined && !isProActive(license)));
</script>

{#if visible}
  <span class="pro-icon" role="img" aria-label={label} title={label}>
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 .5c.4 2.9 1.7 4.6 5.5 5.5-3.8.9-5.1 2.6-5.5 5.5C5.6 8.6 4.3 6.9.5 6 4.3 5.1 5.6 3.4 6 .5Z" fill="currentColor" />
    </svg>
  </span>
{/if}

<style lang="scss">
  // Sits after a label with a small gap, centred on the text, and never takes a line of its own.
  .pro-icon {
    display: inline-flex;
    align-items: center;
    flex: none;
    margin-inline-start: var(--sp-1);
    color: var(--accent);
    vertical-align: middle;
    line-height: 0;
  }
  // Buttons and menu items already space their children (their own gap), so it adds none there.
  :global(.btn) > .pro-icon,
  :global(.menu-item) > .pro-icon {
    margin-inline-start: 0;
  }
</style>
