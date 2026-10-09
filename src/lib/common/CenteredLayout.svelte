<script lang="ts">
  interface Props {
    readonly children: any;
  }

  const { children }: Props = $props();
</script>

<div class="page">
  {@render children()}
</div>
