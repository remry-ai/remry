<script lang="ts">
  // Two-step inline confirmation. Replaces window.confirm(). As an icon: `delete` (a trash
  // can) for something deleted for good, `unlink` (a broken link) for taking something off a
  // list (unlink, remove a member) where both items stay. A × only ever closes.
  import TrashIcon from './TrashIcon.svelte';
  import UnlinkIcon from './UnlinkIcon.svelte';

  interface Props {
    readonly label: string;
    readonly confirmLabel?: string;
    readonly onConfirm: () => Promise<void> | void;
    readonly variant?: 'link' | 'button' | 'unlink' | 'delete';
    readonly title?: string;
    readonly timeoutMs?: number;
  }

  const {
    label,
    confirmLabel = 'Confirm',
    onConfirm,
    variant = 'link',
    title,
    timeoutMs = 6000,
  }: Props = $props();

  let armed = $state(false);
  let busy = $state(false);
  let error = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;

  const disarm = () => {
    armed = false;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const arm = () => {
    armed = true;
    error = '';
    if (timer) clearTimeout(timer);
    timer = setTimeout(disarm, timeoutMs);
  };

  const confirm = async () => {
    busy = true;
    error = '';
    try {
      await onConfirm();
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Could not complete that.';
    } finally {
      busy = false;
      disarm();
    }
  };

  const triggerClass = $derived(
    variant === 'unlink' || variant === 'delete' ? 'btn icon sm danger' : variant === 'button' ? 'btn danger' : 'btn link danger text-sm',
  );
</script>

{#if armed}
  <span class="confirm" role="group" aria-label={`${label}?`}>
    <button type="button" class="btn danger solid sm" onclick={confirm} disabled={busy} aria-busy={busy}>
      {confirmLabel}
    </button>
    <button type="button" class="btn ghost sm" onclick={disarm} disabled={busy}>Cancel</button>
  </span>
{:else}
  <button type="button" class={triggerClass} onclick={arm} title={title ?? label} aria-label={variant === 'unlink' || variant === 'delete' ? label : undefined}>
    {#if variant === 'delete'}<TrashIcon />{:else if variant === 'unlink'}<UnlinkIcon />{:else}{label}{/if}
  </button>
{/if}
{#if error}<span class="inline-error" role="alert">{error}</span>{/if}

<style lang="scss">
  .confirm {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }
</style>
