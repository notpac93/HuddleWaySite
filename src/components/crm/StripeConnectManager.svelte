<script lang="ts">
  import { activeTenantRole, tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { createIdempotencyKey } from '../../lib/api/BackendApi';

  type StripeConnectStatus = {
    connected: boolean;
    detailsSubmitted?: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    reconnectRequired?: boolean;
  };
  type StripeActionResult = {
    onboardingUrl?: string;
    dashboardUrl?: string;
  };

  let status: StripeConnectStatus | null = null;
  let loadState: 'loading' | 'success' | 'error' = 'loading';
  let busy = false;
  let errorMessage = '';
  let loadedKey = '';
  let disconnectDialog = false;

  $: canManage = $activeTenantRole === 'owner' || $activeTenantRole === 'platform_admin';
  $: loadKey = `${$tenantIdStore || ''}:${canManage}`;
  $: if (loadKey !== loadedKey) {
    loadedKey = loadKey;
    status = null;
    errorMessage = '';
    if ($tenantIdStore && canManage) void loadStatus($tenantIdStore);
    else loadState = 'success';
  }

  function message(error: unknown) {
    const code = String((error as { code?: unknown })?.code || '');
    const rawMessage = error instanceof Error ? error.message : String(error || '');
    if (
      code.toLowerCase().includes('appcheck')
      || code.toLowerCase().includes('app-check')
      || /app.?check|recaptcha|throttled/i.test(rawMessage)
    ) {
      return 'Stripe connection could not start because this browser security check was rejected. Refresh the page and try again. If it continues, the production App Check domain or site-key configuration needs attention.';
    }
    if (code.includes('permission') || code.includes('forbidden')) return 'Only the organization owner can manage Stripe.';
    return rawMessage
      ? rawMessage
      : 'The Stripe connection could not be updated.';
  }

  async function loadStatus(tenantId: string) {
    loadState = 'loading';
    try {
      const result = await backendClient.request<StripeConnectStatus>('/stripe/connect/status', { query: { tenantId } });
      if ($tenantIdStore !== tenantId) return;
      status = result;
      loadState = 'success';
    } catch (error) {
      if ($tenantIdStore !== tenantId) return;
      errorMessage = message(error);
      loadState = 'error';
    }
  }

  function openUrl(url: string) {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) window.location.assign(url);
  }

  async function run(action: () => Promise<unknown>, url?: string) {
    busy = true;
    errorMessage = '';
    try {
      const result = await action() as StripeActionResult;
      if (url) openUrl(url);
      else if (result.onboardingUrl || result.dashboardUrl) openUrl(result.onboardingUrl || result.dashboardUrl || '');
    } catch (error) {
      errorMessage = message(error);
    } finally {
      busy = false;
    }
  }

  function connect() {
    if (!$tenantIdStore || !canManage || busy) return;
    const tenantId = $tenantIdStore;
    const idempotencyKey = createIdempotencyKey('stripe-connect-onboarding');
    void run(() => backendClient.request<StripeActionResult>('/stripe/connect/account-link', {
      method: 'POST',
      body: { tenantId },
      idempotencyKey,
    }));
  }

  async function dashboard() {
    if (!$tenantIdStore || !canManage || busy) return;
    void run(() => backendClient.request<StripeActionResult>('/stripe/connect/dashboard-link', { method: 'POST', body: { tenantId: $tenantIdStore } }));
  }

  function disconnect() {
    if (!$tenantIdStore || !canManage || busy) return;
    disconnectDialog = true;
  }

  function cancelDisconnect() {
    disconnectDialog = false;
  }

  function confirmDisconnect() {
    disconnectDialog = false;
    if (!$tenantIdStore || !canManage || busy) return;
    void run(async () => {
      await backendClient.request('/stripe/connect/account', { method: 'DELETE', body: { tenantId: $tenantIdStore } });
      status = {
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    });
  }

  function refresh() {
    if ($tenantIdStore && canManage && !busy) {
      errorMessage = '';
      void loadStatus($tenantIdStore);
    }
  }

</script>

<div class="max-w-3xl mt-6 bg-white shadow rounded-lg p-6" aria-labelledby="settings-stripe-heading">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h3 id="settings-stripe-heading" class="text-lg leading-6 font-medium text-gray-900">Stripe payments</h3>
      <p class="mt-1 text-sm text-gray-500">Connect the account for this organization. The app uses the same tenant connection for paid registration checkout.</p>
    </div>
  </div>

  {#if !canManage}
    <div class="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600" role="status">Stripe connection controls are available to the organization owner.</div>
  {:else if !$tenantIdStore}
    <div class="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">Select an organization before managing its Stripe connection.</div>
  {:else if loadState === 'error'}
    <div class="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
      <p>{errorMessage || 'Stripe status could not be loaded.'}</p>
      <button type="button" class="mt-3 rounded-md border border-red-300 px-3 py-2 font-medium hover:bg-red-100" on:click={refresh}>Retry status</button>
    </div>
  {:else if status}
    {@const ready = status.detailsSubmitted === true && status.chargesEnabled && status.payoutsEnabled}
    <div class="mt-5 rounded-md border {ready ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'} p-4">
      <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span class="rounded-full px-2.5 py-1 {ready ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">{ready ? 'Connected' : 'Not connected'}</span>
        {#if ready}<span class="rounded-full bg-white/80 px-2.5 py-1 text-gray-700">Account connected</span>{/if}
      </div>
      <p class="mt-3 text-sm {ready ? 'text-green-800' : 'text-amber-800'}">{ready ? 'The app can use this account for paid registrations.' : 'Connect Stripe when this organization needs paid registrations.'}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        {#if ready}
          <button type="button" class="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled={busy} on:click={dashboard}>Manage in Stripe</button>
          <button type="button" class="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled={busy} on:click={refresh}>Check status</button>
          <button type="button" class="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={busy} on:click={disconnect}>Disconnect</button>
        {:else}
          <button type="button" class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy} on:click={connect}>Connect Stripe</button>
        {/if}
      </div>
      {#if errorMessage}<p class="mt-3 text-sm text-red-700" role="alert">{errorMessage}</p>{/if}
    </div>
  {/if}
</div>

{#if disconnectDialog}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="presentation">
    <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="stripe-disconnect-title">
      <h3 id="stripe-disconnect-title" class="text-lg font-semibold text-gray-900">Disconnect Stripe?</h3>
      <p class="mt-2 text-sm text-gray-600">Paid registration checkout will stop for this organization until Stripe is connected again.</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700" on:click={cancelDisconnect}>Cancel</button>
        <button type="button" class="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white" on:click={confirmDisconnect}>Confirm disconnect</button>
      </div>
    </div>
  </div>
{/if}
