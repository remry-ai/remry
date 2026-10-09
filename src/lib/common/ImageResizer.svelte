<script lang="ts">
  interface Props {
    readonly maxSize?: number;
    readonly onUpload?: (blob: Blob, filename: string) => void | Promise<void>;
  }

  const { maxSize = 1024, onUpload }: Props = $props();

  let dragOver = $state(false);
  let originalInfo = $state<{ width: number; height: number; size: number } | null>(null);
  let resizedInfo = $state<{ width: number; height: number; size: number } | null>(null);
  let previewUrl = $state<string | null>(null);
  let resizedBlob = $state<Blob | null>(null);
  let filename = $state('');
  let processing = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();

  const resize = (file: File) => {
    processing = true;
    filename = file.name;
    originalInfo = null;
    resizedInfo = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    const img = new Image();
    img.onload = () => {
      originalInfo = { width: img.width, height: img.height, size: file.size };

      const minDim = Math.min(img.width, img.height);
      const scale = minDim > maxSize ? maxSize / minDim : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob((blob) => {
        if (!blob) { processing = false; return; }
        resizedBlob = blob;
        resizedInfo = { width: w, height: h, size: blob.size };
        previewUrl = URL.createObjectURL(blob);
        processing = false;
      }, file.type.startsWith('image/png') ? 'image/png' : 'image/jpeg', 0.9);

      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    resize(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragOver = false;
    handleFiles(e.dataTransfer?.files ?? null);
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const ext = resizedBlob?.type === 'image/png' ? '.png' : '.jpg';
    const base = filename.replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `${base}-resized${ext}`;
    a.click();
  };

  const handleUpload = async () => {
    if (!resizedBlob || !onUpload) return;
    const ext = resizedBlob.type === 'image/png' ? '.png' : '.jpg';
    const base = filename.replace(/\.[^.]+$/, '');
    await onUpload(resizedBlob, `${base}-resized${ext}`);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    resizedBlob = null;
    originalInfo = null;
    resizedInfo = null;
    filename = '';
    if (inputEl) inputEl.value = '';
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="drop-zone"
  class:drag-over={dragOver}
  class:has-preview={!!previewUrl}
  ondragover={(e) => { e.preventDefault(); dragOver = true; }}
  ondragleave={() => dragOver = false}
  ondrop={handleDrop}
  onclick={() => !previewUrl && inputEl?.click()}
>
  <input
    bind:this={inputEl}
    type="file"
    accept="image/*"
    onchange={(e) => handleFiles(e.currentTarget.files)}
    hidden
  />

  {#if processing}
    <p class="placeholder">Resizing…</p>
  {:else if previewUrl && resizedInfo && originalInfo}
    <div class="preview">
      <img src={previewUrl} alt="Resized preview" />
      <div class="info">
        <p>
          <span class="label">Original:</span>
          {originalInfo.width}&times;{originalInfo.height} &middot; {formatSize(originalInfo.size)}
        </p>
        <p>
          <span class="label">Resized:</span>
          {resizedInfo.width}&times;{resizedInfo.height} &middot; {formatSize(resizedInfo.size)}
        </p>
      </div>
      <div class="actions">
        <button type="button" class="btn sm" onclick={handleDownload}>Download</button>
        {#if onUpload}
          <button type="button" class="btn primary sm" onclick={handleUpload}>Upload</button>
        {/if}
        <button type="button" class="btn ghost sm" onclick={(e) => { e.stopPropagation(); reset(); }}>Clear</button>
      </div>
    </div>
  {:else}
    <p class="placeholder">Drop an image here or click to select</p>
    <p class="placeholder-sub">Resizes smallest dimension to {maxSize}px max</p>
  {/if}
</div>

<style lang="scss">
  .drop-zone {
    border: 1px dashed var(--border-strong);
    border-radius: var(--r-lg);
    padding: 2rem;
    text-align: center;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;

    &.drag-over {
      border-color: var(--accent);
      background: var(--accent-soft);
    }

    &.has-preview {
      cursor: default;
      border-style: solid;
    }
  }

  .placeholder {
    color: var(--text-3);
    margin: 0;
  }

  .placeholder-sub {
    color: var(--text-3);
    font-size: 0.8rem;
    margin: 0.25rem 0 0;
  }

  .preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;

    img {
      max-width: 100%;
      max-height: 300px;
      border-radius: 4px;
      object-fit: contain;
    }
  }

  .info {
    font-size: 0.85rem;

    p {
      margin: 0.2rem 0;
    }
  }

  .label {
    font-weight: 600;
    color: var(--text-3);
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
  }
</style>
