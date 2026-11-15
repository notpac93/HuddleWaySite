<script lang="ts">
  import { onMount } from 'svelte';
  import { backendClient } from '../../../lib/api/backendClient';
  import { createIdempotencyKey, type FinancialPeriodRecord, type FinancialPeriodPreview } from '../../../lib/api/BackendApi';

  export let tenantId: string;
  export let section: 'operations' | 'providers' | 'plans';

  type Attempt = { attemptId: string; status: string; eventTitle?: string; createdAt?: string };
  type Recovery = { recoveryKey: string; title: string; detail: string; canRetry: boolean };
  type Subscription = { id: string; payer: string; planName: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; amountCents: number | null; currency: string };
  type Plan = { id: string; name: string; interval: string; amount: number; currency: string; active: boolean };
  type ProviderState = { connected?: boolean; available?: boolean; environment?: string };
  const attemptsPath = '/admin/billing/registration-checkout-attempts';
  const setupPath = '/admin/installment-recovery';
  const auditReason = 'Confirmed by the program owner in Financials.';
  let attempts: Attempt[] = [];
  let subscriptions: Subscription[] = [];
  let subscriptionsTruncated = false;
  let plans: Plan[] = [];
  let planEditor = false;
  let editingPlan: Plan | null = null;
  let planName = '';
  let planAmount: number | undefined;
  let planInterval = 'month';
  let planCurrency = 'USD';
  let planActive = true;
  let recoveries: Recovery[] = [];
  let periods: FinancialPeriodRecord[] = [];
  let providerState: Record<string, ProviderState> = {};
  let loadError = false;
  let loading = true;
  let startDate = '';
  let endDate = '';
  let preview: FinancialPeriodPreview | null = null;
  let previewing = false;
  let confirmation: { label: string; run: () => Promise<unknown> } | null = null;
  let saving = false;
  let actionError = '';
  let message = '';
  let dialog: HTMLDialogElement;
  let mounted = true;
  $: period = { startDate, endDate, label: startDate + ' through ' + endDate };
  $: dateRangeValid = Boolean(startDate && endDate && startDate <= endDate);
  $: matchingPreview = preview && preview.startDate === startDate && preview.endDate === endDate;

  onMount(() => {
    void load();
    return () => { mounted = false; };
  });

  async function load() {
    loading = true;
    loadError = false;
    if (section === 'providers') {
      const results = await Promise.allSettled(['stripe', 'paypal'].map(async (provider) => [
        provider,
        await backendClient.financialOperation(tenantId, '/' + provider + '/connect/status', 'GET'),
      ] as const));
      if (!mounted) return;
      providerState = Object.fromEntries(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []));
      loadError = results.some((result) => result.status === 'rejected');
    } else if (section === 'plans') {
      const [result, paypal] = await Promise.allSettled([
        backendClient.financialOperation(tenantId, '/billing/plans', 'GET', { includeInactive: 'true' }),
        backendClient.financialOperation(tenantId, '/paypal/connect/status', 'GET'),
      ]);
      if (!mounted) return;
      plans = result.status === 'fulfilled' ? (result.value.plans as Plan[] || []) : [];
      providerState = paypal.status === 'fulfilled' ? { paypal: paypal.value } : {};
      loadError = result.status === 'rejected';
    } else {
      const [checkout, installment, accounting, paypal, recurring] = await Promise.allSettled([
        backendClient.financialOperation(tenantId, attemptsPath, 'GET'),
        backendClient.financialOperation(tenantId, setupPath, 'GET'),
        backendClient.financialPeriods(tenantId),
        backendClient.financialOperation(tenantId, '/paypal/connect/status', 'GET'),
        backendClient.financialOperation(tenantId, '/admin/billing/paypal/subscriptions', 'GET'),
      ]);
      if (!mounted) return;
      attempts = checkout.status === 'fulfilled' ? (checkout.value.attempts as Attempt[] || []) : [];
      recoveries = installment.status === 'fulfilled' ? (installment.value.items as Recovery[] || []) : [];
      periods = accounting.status === 'fulfilled' ? accounting.value.periods : [];
      providerState = paypal.status === 'fulfilled' ? { paypal: paypal.value } : {};
      subscriptions = recurring.status === 'fulfilled' ? (recurring.value.subscriptions as Subscription[] || []) : [];
      subscriptionsTruncated = recurring.status === 'fulfilled' && recurring.value.truncated === true;
      loadError = [checkout, installment, accounting, paypal, recurring].some((result) => result.status === 'rejected');
    }
    loading = false;
  }

  function confirm(label: string, path: string, body: Record<string, unknown> = {}, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
    const key = createIdempotencyKey('finance');
    confirmation = { label, run: () => backendClient.financialOperation(tenantId, path, method, body, key) };
    actionError = '';
    dialog.showModal();
  }

  async function submit() {
    if (saving || !confirmation) return;
    saving = true;
    actionError = '';
    try {
      await confirmation.run();
      if (!mounted) return;
      message = 'Request completed. Review the updated records for their current status.';
      preview = null;
      planEditor = false;
      dialog.close();
      await load();
    } catch {
      actionError = 'The result could not be confirmed. Retry this request or refresh before making another change.';
    } finally {
      saving = false;
    }
  }

  async function periodPreview() {
    if (!dateRangeValid || previewing) return;
    previewing = true;
    message = '';
    preview = null;
    try {
      preview = (await backendClient.previewFinancialPeriod(tenantId, period)).preview;
    } catch {
      message = 'The period preview could not be loaded.';
    } finally {
      previewing = false;
    }
  }

  function editPlan(plan: Plan | null) {
    editingPlan = plan;
    planName = plan?.name || '';
    planAmount = plan ? plan.amount / 100 : undefined;
    planInterval = plan?.interval || 'month';
    planCurrency = plan?.currency?.toUpperCase() || 'USD';
    planActive = plan?.active ?? true;
    planEditor = true;
  }

  function reviewPlan() {
    if (!planName.trim()) return;
    if (editingPlan) {
      confirm('Save subscription plan', '/billing/plans/' + encodeURIComponent(editingPlan.id),
        { name: planName.trim(), active: planActive, auditReason }, 'PATCH');
    } else {
      confirm('Create subscription plan', '/billing/plans',
        { name: planName.trim(), amount: Math.round((planAmount || 0) * 100), interval: planInterval, currency: planCurrency, auditReason });
    }
  }

  function formatAmount(cents: number | null, currency: string) {
    return cents == null || !/^[a-z]{3}$/i.test(currency) ? '' : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  }

  async function openProvider(provider: string, dashboard = false) {
    if (saving) return;
    saving = true;
    message = '';
    try {
      const response = await backendClient.financialOperation(
        tenantId, '/' + provider + '/connect/' + (dashboard ? 'dashboard-link' : 'account-link'),
        'POST', {}, createIdempotencyKey('finance-provider'),
      );
      const url = new URL(String(dashboard ? response.dashboardUrl : response.onboardingUrl));
      if (mounted && url.protocol === 'https:') window.location.assign(url.href);
    } catch {
      message = 'The provider could not be opened.';
    } finally {
      saving = false;
    }
  }
</script>

{#if loading}<p role="status">Loading {section === 'providers' ? 'payment providers' : 'operations'}…</p>{/if}
{#if loadError}
  <p role="alert">Some records could not be loaded. <button type="button" class="crm-ui-button-secondary" disabled={loading} on:click={load}>Retry</button></p>
{/if}
{#if message}<p class="my-2 text-sm" role="status">{message}</p>{/if}
{#if section === 'providers'}
  <ul class="divide-y border-y">
    {#each ['stripe', 'paypal'] as provider}
      {@const state = providerState[provider]}
      {#if state && state.available !== false}
        <li class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><strong>{provider === 'stripe' ? 'Stripe' : 'PayPal'}</strong><p class="text-sm text-gray-600">{state.connected ? 'Connected' : 'Not connected'}</p></div>
          <div class="flex flex-wrap gap-2">
            {#if state.connected}
              {#if provider === 'stripe'}<button type="button" class="crm-ui-button-secondary" disabled={saving} on:click={() => openProvider(provider, true)}>Stripe dashboard</button>
              {:else}<a class="crm-ui-button-secondary" href={state.environment === 'sandbox'
                ? 'https://www.sandbox.paypal.com/businessmanage/account/aboutBusiness'
                : 'https://www.paypal.com/businessmanage/account/aboutBusiness'} target="_blank" rel="noopener noreferrer">PayPal dashboard</a>{/if}
              <button type="button" class="crm-ui-button-secondary" on:click={() => confirm('Disconnect ' + (provider === 'stripe' ? 'Stripe' : 'PayPal'), '/' + provider + '/connect/account', { auditReason }, 'DELETE')}>Disconnect</button>
            {:else}
              <button type="button" class="crm-ui-button-primary" disabled={saving} on:click={() => openProvider(provider)}>Connect</button>
            {/if}
          </div>
        </li>
      {/if}
    {/each}
  </ul>
{:else if section === 'plans'}
  <section>
    <div class="flex flex-wrap justify-between gap-2"><h3 class="font-semibold">Subscription plans</h3><button type="button" class="crm-ui-button-primary" on:click={() => editPlan(null)}>New subscription plan</button></div>
    {#if planEditor}
      <form class="my-3 grid gap-2 rounded-lg border p-3" on:submit|preventDefault={reviewPlan}>
        <label>Plan name<input class="crm-ui-input block w-full" required bind:value={planName} /></label>
        {#if editingPlan}
          <label><input type="checkbox" bind:checked={planActive} /> Available for enrollment</label>
        {:else}
          <label>Amount<input type="number" step=".01" min=".01" class="crm-ui-input block" required bind:value={planAmount} /></label>
          <label>Currency<input class="crm-ui-input block" maxlength="3" pattern="[A-Za-z]{3}" required bind:value={planCurrency} /></label>
          <label>Billing interval<select class="crm-ui-input block" bind:value={planInterval}><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select></label>
        {/if}
        <div class="flex gap-2"><button class="crm-ui-button-secondary" type="button" on:click={() => planEditor = false}>Cancel</button><button class="crm-ui-button-primary" type="submit">Review plan</button></div>
      </form>
    {/if}
    <ul class="mt-3 divide-y border-y">
      {#each plans as plan (plan.id)}
        <li class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div><strong>{plan.name}</strong><p class="text-sm text-gray-600">{formatAmount(plan.amount, plan.currency)} / {plan.interval} · {plan.active ? 'Active' : 'Inactive'}</p></div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="crm-ui-button-secondary" on:click={() => editPlan(plan)}>Edit plan</button>
            {#if providerState.paypal?.connected && plan.active}<button type="button" class="crm-ui-button-secondary" on:click={() => confirm('Enable PayPal for ' + plan.name, '/paypal/billing/plans/' + encodeURIComponent(plan.id) + '/provision')}>Enable PayPal</button>{/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <section class="mb-5">
    <div class="mb-2 flex flex-wrap justify-between gap-2">
      <h3 class="font-semibold">Checkout recovery</h3>
      <button type="button" class="crm-ui-button-secondary" disabled={loading} on:click={() => confirm('Reconcile a batch of checkout attempts', attemptsPath + '/reconcile-batch', { limit: 12 })}>Reconcile batch</button>
    </div>
    <ul class="divide-y border-y">
      {#each attempts as attempt (attempt.attemptId)}
        <li class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div><strong>{attempt.eventTitle || 'Registration checkout'}</strong><p class="text-sm text-gray-600">{attempt.status?.replaceAll('_', ' ')} {attempt.createdAt?.slice(0, 10) || ''}</p></div>
          <button type="button" class="crm-ui-button-secondary" on:click={() => confirm('Reconcile checkout attempt', attemptsPath + '/' + encodeURIComponent(attempt.attemptId) + '/reconcile')}>Reconcile</button>
        </li>
      {/each}
    </ul>
  </section>
  <section class="mb-5">
    <div class="mb-2 flex flex-wrap justify-between gap-2">
      <h3 class="font-semibold">Installment recovery</h3>
      <button type="button" class="crm-ui-button-secondary" disabled={loading} on:click={() => confirm('Reconcile event setups', setupPath + '/reconcile-event-setups', { limit: 20 })}>Reconcile event setups</button>
    </div>
    <ul class="divide-y border-y">
      {#each recoveries as recovery (recovery.recoveryKey)}
        <li class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div><strong>{recovery.title}</strong><p class="text-sm text-gray-600">{recovery.detail}</p></div>
          {#if recovery.canRetry}<button class="crm-ui-button-secondary" type="button" on:click={() => confirm('Retry installment recovery', setupPath + '/retry', { recoveryKey: recovery.recoveryKey })}>Retry</button>{/if}
        </li>
      {/each}
    </ul>
  </section>
  {#if subscriptions.length}
    <section class="mb-5">
      <h3 class="font-semibold">PayPal subscriptions</h3>
      {#if subscriptionsTruncated}<p class="text-sm">Showing the first 100 subscriptions.</p>{/if}
      <ul class="divide-y border-y">
        {#each subscriptions as subscription (subscription.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><strong>{subscription.payer || 'Payer unavailable'}</strong><p class="text-sm text-gray-600">{subscription.planName} · {subscription.status} {formatAmount(subscription.amountCents, subscription.currency)}</p>
              {#if subscription.currentPeriodEnd}<p class="text-sm">Period ends {subscription.currentPeriodEnd.slice(0, 10)}</p>{/if}
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="crm-ui-button-secondary" on:click={() => confirm('Reconcile ' + subscription.planName, '/paypal/billing/subscriptions/' + encodeURIComponent(subscription.id) + '/reconcile')}>Reconcile</button>
              {#if subscription.payer && subscription.status === 'active' && !subscription.cancelAtPeriodEnd}
                <button type="button" class="crm-ui-button-secondary" on:click={() => confirm('Cancel ' + subscription.payer + '’s subscription at period end', '/paypal/billing/subscriptions/cancel', { subscriptionId: subscription.id, immediate: false, reason: auditReason })}>Cancel at period end</button>
                <button type="button" class="crm-ui-button-secondary" on:click={() => confirm('Cancel ' + subscription.payer + '’s subscription immediately', '/paypal/billing/subscriptions/cancel', { subscriptionId: subscription.id, immediate: true, reason: auditReason })}>Cancel now</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  <section>
    <h3 class="mb-2 font-semibold">Financial periods</h3>
    <div class="flex flex-wrap items-end gap-2">
      <label class="text-sm">Start date <input type="date" class="crm-ui-input block" bind:value={startDate} /></label>
      <label class="text-sm">End date <input type="date" class="crm-ui-input block" bind:value={endDate} /></label>
      <button type="button" class="crm-ui-button-secondary" disabled={!dateRangeValid || previewing} on:click={periodPreview}>Preview period</button>
      {#if providerState.paypal?.connected}<button type="button" class="crm-ui-button-secondary" disabled={!dateRangeValid} on:click={() => confirm('Reconcile PayPal', '/admin/billing/paypal/reconcile-financials', { startDate, endDate })}>Reconcile PayPal</button>{/if}
    </div>
    {#if matchingPreview && preview}
      <div class="my-2 rounded-lg border p-3 text-sm">
        {#each Object.entries(preview.collections) as [source, result]}<div>{source.replaceAll('_', ' ')} · {result.count}</div>{/each}
        {#if preview.truncated}<p>Preview incomplete. Choose a smaller period.</p>
        {:else}<button type="button" class="crm-ui-button-secondary mt-2" on:click={() => confirm('Close this financial period', '/admin/financial-periods/close', { period, auditReason })}>Close period</button>{/if}
      </div>
    {/if}
    <ul class="mt-3 divide-y border-y">
      {#each periods as item (item.id)}
        <li class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div><strong>{item.label}</strong><p class="text-sm text-gray-600">{item.startDate} – {item.endDate} · {item.status}</p></div>
          {#if item.status === 'closed'}<button type="button" class="crm-ui-button-secondary" on:click={() => confirm('Reopen ' + item.label, '/admin/financial-periods/' + encodeURIComponent(item.id) + '/reopen', { auditReason })}>Reopen</button>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
<dialog bind:this={dialog} aria-label={confirmation?.label ?? 'Confirm operation'} class="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg bg-white p-5 text-gray-900 backdrop:bg-black/50" on:cancel={(event) => { if (saving) event.preventDefault(); }}>
  {#if confirmation}<h2 class="mb-4 text-lg font-semibold">{confirmation.label}</h2>{/if}
  {#if actionError}<p class="mb-3 text-sm text-red-800" role="alert">{actionError}</p>{/if}
  <div class="flex justify-end gap-2">
    <button type="button" class="crm-ui-button-secondary" disabled={saving} on:click={() => dialog.close()}>Cancel</button>
    <button type="button" class="crm-ui-button-primary" disabled={saving} on:click={submit}>{saving ? 'Submitting…' : 'Confirm'}</button>
  </div>
</dialog>
