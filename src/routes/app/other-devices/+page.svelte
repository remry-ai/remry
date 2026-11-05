<script lang="ts">
  // Other devices: open Remry from a phone or another computer through the user's Tailscale
  // tailnet. Turn on checks this computer's Tailscale, shares the app with `tailscale serve`
  // and saves its name (remoteAccess.set --tailscale), which the server then answers on.
  // The address can still be set by hand, for a `tailscale serve` run some other way.
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';
  import { TAILSCALE_DOWNLOAD, TAILSCALE_HTTPS_SETTINGS } from '$shared/remote/tailscale';

  const { data }: { data: PageData } = $props();
  const access = $derived(data.access);
  const tailscale = $derived(data.tailscale);
  const serveCommand = $derived(`tailscale serve --bg ${data.port}`);

  // The steps Turn on needs, in order; the first one not done is where the user is.
  const steps = $derived.by(() => {
    const found = tailscale?.state ?? 'missing';
    // Installed but unreadable stands where not running does: the next step isn't known yet.
    const state = found === 'unreadable' ? 'not-running' : found;
    const order = ['missing', 'not-running', 'signed-out', 'disconnected', 'no-https', 'ready'];
    const reached = order.indexOf(state);
    return [
      { key: 'installed', label: 'Tailscale is installed on this computer', done: reached > 0 },
      { key: 'connected', label: 'Tailscale is open, signed in and connected', done: reached > 3 },
      { key: 'https', label: 'HTTPS certificates are on for your tailnet', done: reached > 4 }
    ];
  });

  let sharing = $state(false);
  let shareError = $state('');
  let checking = $state(false);
  let manual = $state(false);

  const share = async () => {
    sharing = true;
    shareError = '';
    const outcome = await submit(() => trpc().remoteAccess.set.mutate({ tailscale: true, port: data.port }));
    sharing = false;
    if (!outcome.ok) shareError = outcome.error;
    await invalidateAll();
  };

  const checkAgain = async () => {
    checking = true;
    shareError = '';
    await invalidateAll();
    checking = false;
  };

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
    await submitOrThrow(() => trpc().remoteAccess.set.mutate({ tailscale: false, port: data.port }));
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
      {#if tailscale?.state === 'ready' && tailscale.funnel}
        <p class="form-error">Tailscale Funnel is on for this address. Remry refuses its traffic from the internet, but turn Funnel off unless something else needs it.</p>
      {/if}
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

  {#if !data.remote && !access.url}
    <section class="card">
      <h4>Turn it on</h4>
      <p class="text-2">Install Tailscale on your phone too, signed in to the same account. Remry does the rest on this computer.</p>
      <ul class="list checks">
        {#each steps as step (step.key)}
          <li class="list-row">
            <span class="badge" class:success={step.done}>{step.done ? 'Done' : 'To do'}</span>
            <span class="grow">{step.label}</span>
          </li>
        {/each}
      </ul>
      {#if tailscale?.state === 'missing'}
        <p>Install <a href={TAILSCALE_DOWNLOAD} target="_blank" rel="noopener">Tailscale</a> and sign in, then check again.</p>
      {:else if tailscale?.state === 'not-running'}
        <p>Open the Tailscale app, then check again.</p>
        {#if tailscale.detail}<p class="text-2 mono">{tailscale.detail}</p>{/if}
      {:else if tailscale?.state === 'unreadable'}
        <p>Remry found Tailscale but couldn't read its status. Check that the Tailscale app is open and signed in, then check again. If this keeps happening, install the command-line tool from Tailscale's Settings (CLI integration).</p>
        <p class="text-2 mono">{tailscale.cli}: {tailscale.detail}</p>
      {:else if tailscale?.state === 'signed-out'}
        <p>Sign in to Tailscale from its menu bar icon, then check again.</p>
      {:else if tailscale?.state === 'disconnected'}
        <p>Connect Tailscale from its menu bar icon, then check again.</p>
      {:else if tailscale?.state === 'no-https'}
        <p>Turn on <strong>HTTPS Certificates</strong> in your <a href={TAILSCALE_HTTPS_SETTINGS} target="_blank" rel="noopener">tailnet's DNS settings</a>, then check again. Other devices get a private HTTPS address, <code>{tailscale.hostname}</code>.</p>
      {:else if tailscale?.state === 'ready'}
        {#if tailscale.serving === 'other'}
          <p class="form-error">Tailscale already shares something else at https://{tailscale.hostname}/. Run <code>tailscale serve status</code> to see it.</p>
        {:else}
          <p>Ready. Turn on shares Remry on your tailnet at <strong>https://{tailscale.hostname}/app</strong>.</p>
        {/if}
      {/if}
      {#if shareError}<p class="form-error">{shareError}</p>{/if}
      <div class="form-actions">
        {#if tailscale?.state === 'ready'}
          <button type="button" class="btn primary" disabled={sharing || tailscale.serving === 'other'} aria-busy={sharing} onclick={share}>{sharing ? 'Turning on…' : 'Turn on'}</button>
        {:else}
          <button type="button" class="btn" disabled={checking} aria-busy={checking} onclick={checkAgain}>{checking ? 'Checking…' : 'Check again'}</button>
        {/if}
      </div>
    </section>

    <section class="card">
      <h4 class="manual-heading">
        <DisclosureButton expanded={manual} label="enter the address yourself" onToggle={() => (manual = !manual)}>Or enter the address yourself</DisclosureButton>
      </h4>
      {#if manual}
        <form onsubmit={(e) => { e.preventDefault(); save(); }}>
          <p class="text-2">If you share Remry with <code>{serveCommand}</code> yourself, paste the address it prints.</p>
          <Field label="This computer's tailnet address" hint="Like https://my-mac.tail1234.ts.net. Remry answers only this name, never Tailscale Funnel's public traffic.">
            {#snippet children({ id })}
              <input {id} type="text" bind:value={address} spellcheck="false" autocomplete="off" placeholder="https://my-mac.tail1234.ts.net" />
            {/snippet}
          </Field>
          {#if error}<p class="form-error">{error}</p>{/if}
          <div class="form-actions">
            <button type="submit" class="btn" disabled={busy || !address.trim()} aria-busy={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      {/if}
    </section>
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
  .checks { margin: 0; }
  .manual-heading { margin: 0; }
  form { display: grid; gap: var(--sp-2); }
  code { white-space: nowrap; }
  input[type='text'] { width: 100%; }
  .toggle { display: flex; align-items: center; gap: var(--sp-2); }
</style>
