<script lang="ts">
  // Remry Pro: the license on this computer, what it unlocks, and where to
  // add or remove a key. The key is checked here, offline; nothing is sent anywhere.
  // Buying happens on a Stripe Payment Link and help is on GitHub: these are only links.
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';
  import { isProActive, PRO_FEATURES, PRO_FEATURE_LABELS, RENEWAL_NOTICE_DAYS } from '$shared/types/license';
  import { REMRY_LINKS } from '$shared/types/site';

  const { data }: { data: PageData } = $props();
  const license = $derived(data.license);
  const active = $derived(isProActive(license));
  const renewSoon = $derived(active && license.daysLeft !== null && license.daysLeft <= RENEWAL_NOTICE_DAYS);

  let key = $state('');
  let busy = $state(false);
  let error = $state('');

  const activate = async () => {
    busy = true;
    error = '';
    const outcome = await submit(() => trpc().license.activate.mutate({ key: key.trim() }));
    busy = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    key = '';
    await invalidateAll();
  };

  const remove = async () => {
    await submitOrThrow(() => trpc().license.remove.mutate());
    await invalidateAll();
  };
</script>

<svelte:head><title>License</title></svelte:head>

<div class="page">
  <PageHeader title="License" description="Remry Pro unlocks branding, PDF export and full-text search. A license lasts a year, and everything else is free." />

  <section class="card status">
    {#if active}
      <p class="headline"><span class="badge success">Pro</span> Licensed to <strong>{license.licensee?.name}</strong> <span class="text-2">({license.licensee?.email})</span></p>
      <p class="text-2" class:warning={renewSoon}>
        Good through {license.expires} ({license.daysLeft} {license.daysLeft === 1 ? 'day' : 'days'} left).{#if renewSoon} A subscription renews itself and emails the new key; add it here when it arrives. Until you do, the Pro features lock when this one lapses.{/if}
      </p>
    {:else if license.state === 'expired'}
      <p class="headline"><span class="badge warning">Expired</span> The license for <strong>{license.licensee?.name}</strong> ended on {license.expires}.</p>
      <p class="text-2">The Pro features are locked until you add the renewed key. Your brandings, docs and notes are all still here.</p>
    {:else if license.state === 'invalid'}
      <p class="headline"><span class="badge danger">Invalid</span> The license key on this computer can't be used.</p>
      <p class="text-2">{license.problem}</p>
    {:else}
      <p class="headline">No license on this computer.</p>
      <p class="text-2">Remry is free to use. Pro adds the features below.</p>
    {/if}

    <div class="links">
      {#if license.state === 'expired'}
        <a class="btn primary sm" href={REMRY_LINKS.buy} target="_blank" rel="noopener">Renew Remry Pro</a>
      {:else if !active}
        <a class="btn primary sm" href={REMRY_LINKS.buy} target="_blank" rel="noopener">Buy Remry Pro</a>
      {/if}
      <a class="text-2" href={REMRY_LINKS.help} target="_blank" rel="noopener">Help with Remry Pro and lost keys</a>
    </div>

    <ul class="list features">
      {#each PRO_FEATURES as feature (feature)}
        <li class="list-row">
          <span class="grow">{PRO_FEATURE_LABELS[feature]}</span>
          <span class="meta">{active ? 'Unlocked' : 'Locked'}</span>
        </li>
      {/each}
    </ul>

    {#if license.state !== 'none'}
      <div class="remove">
        <ConfirmButton label="Remove the license from this computer" confirmLabel="Remove license" variant="link" onConfirm={remove} />
      </div>
    {/if}
  </section>

  <form class="card add" onsubmit={(e) => { e.preventDefault(); activate(); }}>
    <Field label={active ? 'Renewed license key' : 'License key'} hint="Paste the key you were sent. It starts with WN1. and is checked on this computer; nothing is sent anywhere.">
      {#snippet children({ id })}
        <textarea {id} rows="3" bind:value={key} spellcheck="false" autocomplete="off" class="mono" placeholder="WN1.…"></textarea>
      {/snippet}
    </Field>
    {#if error}<p class="form-error">{error}</p>{/if}
    <div class="form-actions">
      <button type="submit" class="btn primary" disabled={busy || !key.trim()} aria-busy={busy}>{busy ? 'Checking…' : active ? 'Use this key' : 'Add license'}</button>
    </div>
  </form>
</div>

<style lang="scss">
  .card { max-width: 640px; margin-bottom: var(--sp-5); display: grid; gap: var(--sp-2); }
  .headline { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: 0; }
  .card p { margin: 0; }
  .warning { color: var(--warning); }
  .links { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-2); }
  .features { margin-top: var(--sp-2); }
  .remove { margin-top: var(--sp-2); }
  textarea { width: 100%; resize: vertical; }
</style>
