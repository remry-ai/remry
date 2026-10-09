<script lang="ts">
  import type { PageData } from './$types';
  import { trpc } from '$shared/trpc/client';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Field from '$lib/ui/Field.svelte';
  import { submit } from '$lib/ui/submit';
  import ProLock from '$lib/ui/ProLock.svelte';
  import { isProActive, lockedMessage } from '$shared/types/license';

  const { data } = $props<{ data: PageData }>();
  const brandings = $derived(data.brandings.ok ? data.brandings.value : []);
  // Branding is Remry Pro: without a license, profiles are listed but can't be made or changed.
  const locked = $derived(!isProActive(data.license));

  let busy = $state(false);
  let showCreate = $state(false);
  let newName = $state('');
  let error = $state('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    busy = true;
    error = '';
    const outcome = await submit(() => trpc().branding.create.mutate({ name: newName.trim() }));
    busy = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    goto(`/app/branding/${outcome.value.id}`);
  };
</script>

<svelte:head><title>Branding</title></svelte:head>

<div class="page">
  <PageHeader title="Branding" description="Logos and colours applied to reports and their printed PDFs.">
    {#if !locked}
      <button type="button" class="btn primary" onclick={() => { showCreate = !showCreate; }}>
        {showCreate ? 'Cancel' : 'New profile'}
      </button>
    {/if}
  </PageHeader>

  {#if locked}
    <ProLock title="Branding" message={lockedMessage('branding', data.license, 'app')} compact />
  {/if}

  {#if showCreate}
    <form class="card create-form" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
      <Field label="Profile name">
        {#snippet children({ id })}
          <input {id} type="text" bind:value={newName} placeholder="e.g. Acme Corp" required />
        {/snippet}
      </Field>
      {#if error}<p class="form-error">{error}</p>{/if}
      <div class="form-actions">
        <button type="submit" class="btn primary" disabled={busy || !newName.trim()} aria-busy={busy}>Create profile</button>
        <button type="button" class="btn ghost" onclick={() => { showCreate = false; }}>Cancel</button>
      </div>
    </form>
  {/if}

  {#if brandings.length === 0 && !showCreate}
    <EmptyState message="No branding profiles yet." boxed>
      {#if !locked}<button type="button" class="btn sm" onclick={() => { showCreate = true; }}>New profile</button>{/if}
    </EmptyState>
  {/if}

  {#if brandings.length > 0}
    <div class="brand-grid">
      {#each brandings as brand (brand.id)}
        <a href="/app/branding/{brand.id}" class="card compact hover brand-card">
          <div class="brand-swatches">
            <span class="swatch" style="background:{brand.primaryColor}"></span>
            <span class="swatch" style="background:{brand.accentColor}"></span>
          </div>
          <div class="brand-info">
            <span class="brand-name">
              {brand.name}
              {#if brand.isDefault}<span class="badge accent">Default</span>{/if}
            </span>
            <span class="text-sm muted">
              {#if brand.hasIcon}icon{/if}
              {#if brand.hasLogo}{#if brand.hasIcon} · {/if}logo{/if}
            </span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-width: 420px;
    margin-bottom: var(--sp-5);
  }
  .brand-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--sp-3);
  }
  .brand-card {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: inherit;
    &:hover { text-decoration: none; }
  }
  .brand-swatches {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .swatch {
    display: block;
    width: 28px;
    height: 12px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
  }
  .brand-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .brand-name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-weight: 500;
  }
</style>
