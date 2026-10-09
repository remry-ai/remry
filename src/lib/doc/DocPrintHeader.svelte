<script lang="ts">
  // The letterhead at the top of an exported doc: the brand's logo on white, a rule in the
  // brand colour, then the title. Brand colours belong here and in the printed body only;
  // app chrome keeps the accent tokens.
  interface HeaderBranding {
    readonly name: string;
    readonly logoUrl: string | null;
    readonly iconUrl: string | null;
    readonly primaryColor: string;
  }

  interface Props {
    readonly branding: HeaderBranding;
    readonly title: string;
  }

  const { branding, title }: Props = $props();
  const imageUrl = $derived(branding.logoUrl ?? branding.iconUrl);
</script>

<header class="doc-print-header" style:--brand-primary={branding.primaryColor}>
  <div class="letterhead">
    {#if imageUrl}<img src={imageUrl} alt={branding.name} />{/if}
  </div>
  <h1>{title}</h1>
</header>

<style lang="scss">
  .doc-print-header {
    margin-bottom: var(--sp-6);
    break-inside: avoid;
  }
  .letterhead {
    padding-bottom: var(--sp-4);
    margin-bottom: var(--sp-6);
    border-bottom: 1px solid var(--brand-primary);
    img {
      display: block;
      width: auto;
      max-height: 34px;
      max-width: 160px;
      object-fit: contain;
    }
  }
  h1 {
    margin: 0;
    font-size: 1.6rem;
    color: var(--brand-primary);
  }
</style>
