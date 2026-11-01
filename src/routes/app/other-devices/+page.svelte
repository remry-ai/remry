<script lang="ts">
  // Other devices: open Remry from a phone or another computer through the user's Tailscale
  // tailnet. `tailscale serve` shares the app on the tailnet; this page saves the name it's
  // shared as (remoteAccess.set), which the server then answers on. Nothing else opens it.
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';

  const { data }: { data: PageData } = $props();
  const access = $derived(data.access);
  const serveCommand = $derived(`tailscale serve --bg ${data.port ?? 7369}`);

  let address = $state('');
  let busy = $state(false);
  let error = $state('');

  const save = async () => {
    busy = true;
    error = '';
    const outcome = await submit(() => trpc().remoteAccess.set.mutate({ hostname: address.trim() }));
    busy = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    address = '';
    await invalidateAll();
  };

  let loginBusy = $state(false);
  let loginError = $state('');

  const setLogin = async (enabled: boolean) => {
    loginBusy = true;
    loginError = '';
    const outcome = await submit(() => trpc().remoteAccess.set.mutate({ startAtLogin: enabled }));
    loginBusy = false;
    if (!outcome.ok) loginError = outcome.error;
    await invalidateAll();
  };

  const turnOff = async () => {
    await submitOrThrow(() => trpc().remoteAccess.set.mutate({ hostname: null }));
    // From another device, this page is now out of reach.
    if (data.remote) window.location.reload();
    else await invalidateAll();
  };
</script>

<svelte:head><title>Other devices</title></svelte:head>

<div class="page">
  <PageHeader title="Other devices" description="Open Remry from your phone or another computer, privately, through Tailscale. Your notebooks stay on this computer." />

  <section class="card">
    {#if access.url}
      <p class="headline"><span class="badge success">On</span> Devices on your tailnet can open Remry.</p>
      <p><a href={access.url} target="_blank" rel="noopener">{access.url}</a></p>
      <p class="text-2">This computer has to be awake, with Remry running. Anyone on your tailnet can open it, so if you share your tailnet, limit who can reach this computer in Tailscale's access controls.</p>
      <div class="actions">
        <ConfirmButton
          label="Turn off"
          confirmLabel={data.remote ? 'Turn off (this device loses access)' : 'Turn off'}
          variant="button"
          onConfirm={turnOff}
        />
      </div>
    {:else}
      <p class="headline"><span class="badge">Off</span> Only this computer can open Remry.</p>
    {/if}
  </section>

  {#if !data.remote}
    <form class="card" onsubmit={(e) => { e.preventDefault(); save(); }}>
      <h4>{access.url ? 'Change the address' : 'Turn it on'}</h4>
      <ol class="steps">
        <li>Install <a href="https://tailscale.com/download" target="_blank" rel="noopener">Tailscale</a> on this computer and on your phone, signed in to the same account.</li>
        <li>On this computer, run <code>{serveCommand}</code> in Terminal. It prints an address ending in <code>.ts.net</code>.</li>
        <li>Paste that address here.</li>
      </ol>
      <Field label="This computer's tailnet address" hint="Like https://my-mac.tail1234.ts.net. Remry answers only this name, never Tailscale Funnel's public traffic.">
        {#snippet children({ id })}
          <input {id} type="text" bind:value={address} spellcheck="false" autocomplete="off" class="mono" placeholder={access.hostname ?? 'https://my-mac.tail1234.ts.net'} />
        {/snippet}
      </Field>
      {#if error}<p class="form-error">{error}</p>{/if}
      <div class="form-actions">
        <button type="submit" class="btn primary" disabled={busy || !address.trim()} aria-busy={busy}>{busy ? 'Saving…' : access.url ? 'Save' : 'Turn on'}</button>
      </div>
      <p class="text-2">To stop sharing on your tailnet too, run <code>tailscale serve reset</code>.</p>
    </form>
  {/if}

  <section class="card">
    <h4>Start at login</h4>
    {#if data.startAtLogin.supported}
      <label class="toggle">
        <input type="checkbox" role="switch" checked={data.startAtLogin.enabled} disabled={loginBusy} onchange={(e) => setLogin(e.currentTarget.checked)} />
        <span>Start Remry when you log in to this Mac</span>
      </label>
      <p class="text-2">Remry runs in the background with no window, so your other devices can open it after a restart. Tailscale needs to open at login too (its Settings → Launch at login), and the Mac has to stay awake.</p>
      {#if loginError}<p class="form-error">{loginError}</p>{/if}
    {:else}
      <p class="text-2">{data.startAtLogin.reason}</p>
    {/if}
  </section>
</div>

<style lang="scss">
  .card { max-width: 640px; margin-bottom: var(--sp-5); display: grid; gap: var(--sp-2); }
  .card p, .card h4 { margin: 0; }
  .headline { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .actions { margin-top: var(--sp-2); }
  .steps { margin: 0; padding-left: var(--sp-5); display: grid; gap: var(--sp-1); }
  .steps code { white-space: nowrap; }
  input[type='text'] { width: 100%; }
  .toggle { display: flex; align-items: center; gap: var(--sp-2); }
</style>
