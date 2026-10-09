<script lang="ts">
  import type { PageData } from './$types';
  import { trpc } from '$shared/trpc/client';
  import { goto, invalidateAll } from '$app/navigation';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit } from '$lib/ui/submit';
  import ProLock from '$lib/ui/ProLock.svelte';
  import { isProActive, lockedMessage } from '$shared/types/license';

  const { data } = $props<{ data: PageData }>();
  const brand = $derived(data.brand);
  // Branding is Remry Pro: without a license the profile is shown but can't be changed.
  const locked = $derived(!isProActive(data.license));

  let name = $state(brand.name);
  let primaryColor = $state(brand.primaryColor);
  let accentColor = $state(brand.accentColor);
  let primaryFontColor = $state(brand.primaryFontColor);
  let accentFontColor = $state(brand.accentFontColor);
  let iconPreview = $state(brand.iconUrl ?? '');
  let logoPreview = $state(brand.logoUrl ?? '');
  let pendingIconBlob = $state<Blob | null>(null);
  let pendingLogoBlob = $state<Blob | null>(null);
  let iconRemoved = $state(false);
  let logoRemoved = $state(false);
  let isDefault = $state(brand.isDefault);

  let busy = $state(false);
  let saved = $state(false);
  let error = $state('');

  const resizeToBlob = (file: File, maxW: number, maxH: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
          file.type.startsWith('image/png') ? 'image/png' : 'image/jpeg',
          0.9
        );
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });

  const handleFileSelect = async (e: Event, target: 'icon' | 'logo') => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const maxW = target === 'icon' ? 256 : 800;
      const maxH = target === 'icon' ? 256 : 200;
      const blob = await resizeToBlob(file, maxW, maxH);
      const preview = URL.createObjectURL(blob);
      if (target === 'icon') { iconPreview = preview; pendingIconBlob = blob; iconRemoved = false; }
      else { logoPreview = preview; pendingLogoBlob = blob; logoRemoved = false; }
    } catch {
      error = 'Failed to process image';
    }
  };

  const blobToBase64 = async (blob: Blob): Promise<string> => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };

  const uploadBlob = async (blob: Blob, type: 'icon' | 'logo'): Promise<string | null> => {
    const dataBase64 = await blobToBase64(blob);
    const outcome = await submit(() => trpc().branding.uploadImage.mutate({
      brandingId: brand.id,
      type,
      contentType: blob.type === 'image/png' ? 'image/png' : 'image/jpeg',
      dataBase64,
    }));
    if (!outcome.ok) { error = outcome.error; return null; }
    return outcome.value.key;
  };

  const handleRemoveImage = (target: 'icon' | 'logo') => {
    if (target === 'icon') { iconPreview = ''; pendingIconBlob = null; iconRemoved = true; }
    else { logoPreview = ''; pendingLogoBlob = null; logoRemoved = true; }
  };

  const handleSave = async () => {
    busy = true;
    error = '';
    try {
      const input: Record<string, unknown> = {
        id: brand.id,
        name,
        primaryColor,
        accentColor,
        primaryFontColor,
        accentFontColor,
        isDefault,
      };

      if (pendingIconBlob) {
        const key = await uploadBlob(pendingIconBlob, 'icon');
        if (!key) return;
        input.iconUrl = key;
      } else if (iconRemoved) {
        input.iconUrl = null;
      }

      if (pendingLogoBlob) {
        const key = await uploadBlob(pendingLogoBlob, 'logo');
        if (!key) return;
        input.logoUrl = key;
      } else if (logoRemoved) {
        input.logoUrl = null;
      }

      const outcome = await submit(() => trpc().branding.update.mutate(input as any));
      if (!outcome.ok) {
        error = outcome.error;
        return;
      }
      pendingIconBlob = null;
      pendingLogoBlob = null;
      iconRemoved = false;
      logoRemoved = false;
      saved = true;
      setTimeout(() => { saved = false; }, 2000);
      await invalidateAll();
    } finally {
      busy = false;
    }
  };

  const handleDelete = async () => {
    error = '';
    const outcome = await submit(() => trpc().branding.delete.mutate({ id: brand.id }));
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    goto('/app/branding');
  };
</script>

<svelte:head><title>{brand.name} - Branding</title></svelte:head>

<div class="page">
  <nav aria-label="breadcrumb">
    <ul>
      <li><a href="/app/branding">Branding</a></li>
      <li>{brand.name}</li>
    </ul>
  </nav>

  <header class="page-header">
    <h1>{brand.name}</h1>
    <div class="actions">
      {#if saved}<span class="saved text-sm">Saved</span>{/if}
      <button type="button" class="btn primary" onclick={handleSave} disabled={locked || busy || !name.trim()} aria-busy={busy}>Save changes</button>
    </div>
  </header>

  {#if locked}
    <ProLock title="Branding" message={lockedMessage('branding', data.license, 'app')} compact />
  {/if}

  {#if error}
    <p class="form-error">{error}</p>
  {/if}

  <div class="editor-layout">
    <div class="editor-form form-grid">
      <section class="section">
        <div class="section-header"><h4>General</h4></div>
        <div class="form-grid">
          <Field label="Profile name">
            {#snippet children({ id })}
              <input {id} type="text" bind:value={name} required />
            {/snippet}
          </Field>
          <label class="toggle">
            <input type="checkbox" role="switch" bind:checked={isDefault} />
            <span>Default profile, used by reports that don't pick a branding</span>
          </label>
        </div>
      </section>

      <section class="section">
        <div class="section-header"><h4>Colors</h4></div>
        <div class="form-row">
          <Field label="Primary">
            {#snippet children({ id })}
              <div class="color-row">
                <input type="color" bind:value={primaryColor} aria-label="Primary color" />
                <input {id} type="text" class="mono" bind:value={primaryColor} />
              </div>
            {/snippet}
          </Field>
          <Field label="Primary font">
            {#snippet children({ id })}
              <div class="color-row">
                <input type="color" bind:value={primaryFontColor} aria-label="Primary font color" />
                <input {id} type="text" class="mono" bind:value={primaryFontColor} />
              </div>
            {/snippet}
          </Field>
          <Field label="Accent">
            {#snippet children({ id })}
              <div class="color-row">
                <input type="color" bind:value={accentColor} aria-label="Accent color" />
                <input {id} type="text" class="mono" bind:value={accentColor} />
              </div>
            {/snippet}
          </Field>
          <Field label="Accent font">
            {#snippet children({ id })}
              <div class="color-row">
                <input type="color" bind:value={accentFontColor} aria-label="Accent font color" />
                <input {id} type="text" class="mono" bind:value={accentFontColor} />
              </div>
            {/snippet}
          </Field>
        </div>
      </section>

      <section class="section">
        <div class="section-header"><h4>Images</h4></div>
        <div class="form-row">
          <Field label="Icon" hint="Square, shown in the nav">
            {#snippet children({ id })}
              <input {id} type="file" accept="image/*" onchange={(e) => handleFileSelect(e, 'icon')} />
              {#if iconPreview}
                <div class="image-preview">
                  <img src={iconPreview} alt="Icon preview" class="icon-preview" />
                  <button type="button" class="btn link danger text-sm" onclick={() => handleRemoveImage('icon')}>Remove</button>
                </div>
              {/if}
            {/snippet}
          </Field>
          <Field label="Logo" hint="Horizontal, shown on reports">
            {#snippet children({ id })}
              <input {id} type="file" accept="image/*" onchange={(e) => handleFileSelect(e, 'logo')} />
              {#if logoPreview}
                <div class="image-preview">
                  <img src={logoPreview} alt="Logo preview" class="logo-preview" />
                  <button type="button" class="btn link danger text-sm" onclick={() => handleRemoveImage('logo')}>Remove</button>
                </div>
              {/if}
            {/snippet}
          </Field>
        </div>
      </section>

      <section class="section danger-zone">
        {#if !locked}<ConfirmButton label="Delete profile" confirmLabel="Delete profile" variant="button" onConfirm={handleDelete} />{/if}
      </section>
    </div>

    <aside class="preview-panel">
      <div class="section-header"><h4>Preview</h4></div>
      <div class="card preview-card">
        {#if logoPreview}
          <img src={logoPreview} alt="Logo" class="preview-logo" />
        {/if}
        <div class="preview-btn" style="background:{primaryColor};color:{primaryFontColor}">Primary</div>
        <div class="preview-btn" style="background:{accentColor};color:{accentFontColor}">Accent</div>
        <table class="preview-table">
          <thead><tr><th style="background:{primaryColor};color:{primaryFontColor}">Heading</th><th style="background:{primaryColor};color:{primaryFontColor}">Value</th></tr></thead>
          <tbody><tr><td>Row</td><td>12</td></tr></tbody>
        </table>
      </div>
    </aside>
  </div>
</div>

<style lang="scss">
  .editor-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: var(--sp-8);
    align-items: start;
    @include below-md { grid-template-columns: 1fr; }
  }
  .editor-form { gap: var(--sp-6); }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-weight: 400;
    color: var(--text);
    input { margin: 0; }
  }
  .color-row {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
    input[type='text'] { flex: 1; font-size: var(--fs-sm); }
  }
  .image-preview {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
  }
  .icon-preview {
    width: 40px;
    height: 40px;
    object-fit: contain;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
  }
  .logo-preview {
    max-height: 40px;
    max-width: 160px;
    object-fit: contain;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
  }
  .saved { color: var(--success); }
  .danger-zone {
    padding-top: var(--sp-4);
    border-top: 1px solid var(--border);
  }
  .preview-panel {
    position: sticky;
    top: var(--sp-4);
  }
  .preview-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .preview-logo {
    max-height: 36px;
    max-width: 100%;
    object-fit: contain;
    align-self: flex-start;
  }
  .preview-btn {
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    text-align: center;
    font-weight: 600;
    font-size: var(--fs-md);
  }
  .preview-table {
    font-size: var(--fs-sm);
    th { text-transform: none; letter-spacing: 0; }
  }
</style>
