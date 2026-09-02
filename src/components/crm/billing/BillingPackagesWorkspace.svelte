<script lang="ts">
  import { onMount } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { billingOperationsApi } from '../../../lib/api/BillingOperationsApi';
  import {
    BackendApiError,
    createIdempotencyKey,
    type BillingPackageRecord,
  } from '../../../lib/api/BackendApi';
  import { seasonsStore, teamsStore } from '../../../lib/services/DataStore';

  let packages: BillingPackageRecord[] = [];
  let loading = true;
  let loadError = '';
  let requestId = '';
  let editorOpen = false;
  let editing: BillingPackageRecord | null = null;
  let saving = false;
  let saveError = '';

  let name = '';
  let packageKind: 'season' | 'team' | 'combined' = 'season';
  let seasonId = '';
  let teamId = '';
  let seasonAmount = '';
  let teamAmount = '';
  let paymentMode: 'pay_in_full' | 'installments' = 'pay_in_full';
  let installmentCount = 3;
  let cadence: 'weekly' | 'monthly' = 'monthly';
  let feeHandling: 'organization_pays' | 'registrant_pays' = 'organization_pays';
  let cashAccepted = false;
  let discountsEnabled = false;
  let cancellationPolicy = '';
  let refundPolicy = '';
  let active = true;

  $: seasonCents = ['season', 'combined'].includes(packageKind)
    ? parseCents(seasonAmount)
    : 0;
  $: teamCents = ['team', 'combined'].includes(packageKind)
    ? parseCents(teamAmount)
    : 0;
  $: totalCents = (seasonCents ?? 0) + (teamCents ?? 0);
  $: installmentAmounts = allocate(totalCents, paymentMode === 'installments' ? installmentCount : 1);

  onMount(loadPackages);

  function parseCents(value: string) {
    const match = value.trim().replace(/,/g, '').match(/^(?:0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/);
    if (!match) return null;
    const [whole, fraction = ''] = value.trim().replace(/,/g, '').split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(cents) ? cents : null;
  }

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  function allocate(total: number, count: number) {
    if (total < 1 || count < 1 || total < count) return [];
    const base = Math.floor(total / count);
    return Array.from({ length: count }, (_, index) =>
      index === count - 1 ? total - base * (count - 1) : base,
    );
  }

  function installmentTiming(index: number, count: number) {
    if (index === 0) return 'due at enrollment';
    const unit = cadence === 'weekly' ? 'week' : 'month';
    const offset = index;
    return `due ${offset} ${unit}${offset === 1 ? '' : 's'} after enrollment${index === count - 1 ? ' (final payment)' : ''}`;
  }

  function policyText(record: BillingPackageRecord, key: 'cancellation' | 'refund') {
    const value = record.paymentPolicies?.[key];
    return value && typeof value === 'object'
      ? String((value as Record<string, unknown>).text || '')
      : '';
  }

  async function loadPackages() {
    const tenantId = $tenantIdStore;
    if (!tenantId) return;
    loading = true;
    loadError = '';
    requestId = '';
    try {
      packages = await billingOperationsApi.billingPackages(tenantId);
    } catch (error) {
      loadError = 'Payment setup could not be loaded.';
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    } finally {
      loading = false;
    }
  }

  function openEditor(record: BillingPackageRecord | null = null) {
    editing = record;
    name = record?.name || '';
    seasonId = record?.seasonId || '';
    teamId = record?.eligibleTeamIds?.[0] || '';
    const seasonLine = record?.lineItems.find((item) => item.kind === 'season');
    const teamLine = record?.lineItems.find((item) => item.kind === 'team');
    packageKind = seasonLine && teamLine
      ? 'combined'
      : teamLine || (!record && $seasonsStore.length === 0 && $teamsStore.length > 0)
        ? 'team'
        : 'season';
    seasonAmount = seasonLine ? (seasonLine.amountCents / 100).toFixed(2) : '';
    teamAmount = teamLine ? (teamLine.amountCents / 100).toFixed(2) : '';
    const terms = record?.paymentTerms || {};
    paymentMode = terms.mode === 'installments' ? 'installments' : 'pay_in_full';
    installmentCount = Number(terms.installmentCount || 3);
    cadence = terms.cadence === 'weekly' ? 'weekly' : 'monthly';
    feeHandling = terms.feeHandling === 'registrant_pays' ? 'registrant_pays' : 'organization_pays';
    cashAccepted = terms.cashAccepted === true;
    discountsEnabled = terms.discountsEnabled === true;
    cancellationPolicy = record ? policyText(record, 'cancellation') : '';
    refundPolicy = record ? policyText(record, 'refund') : '';
    active = record?.active !== false;
    saveError = '';
    editorOpen = true;
  }

  function sourceName(kind: 'season' | 'team', id: string) {
    const source = kind === 'season'
      ? $seasonsStore.find((item) => String(item.id) === id)
      : $teamsStore.find((item) => String(item.id) === id);
    return String(source?.name || source?.title || (kind === 'season' ? 'Season fee' : 'Team fee'));
  }

  async function savePackage() {
    const tenantId = $tenantIdStore;
    if (!tenantId || saving) return;
    if (name.trim().length < 3 || totalCents < 1) {
      saveError = 'Add a clear name and a valid amount.';
      return;
    }
    if (['season', 'combined'].includes(packageKind) && (!seasonId || !seasonCents)) {
      saveError = 'Choose a season and enter its amount.';
      return;
    }
    if (['team', 'combined'].includes(packageKind) && (!teamId || !teamCents)) {
      saveError = 'Choose a team and enter its amount.';
      return;
    }
    if (!cancellationPolicy.trim() || !refundPolicy.trim()) {
      saveError = 'Add the cancellation and refund information families should see.';
      return;
    }
    if (paymentMode === 'installments' && installmentAmounts.length !== installmentCount) {
      saveError = 'Choose a valid number of payments for this total.';
      return;
    }
    saving = true;
    saveError = '';
    const lineItems = [
      ...(['season', 'combined'].includes(packageKind)
        ? [{ code: 'season_fee', label: sourceName('season', seasonId), kind: 'season', amountCents: seasonCents }]
        : []),
      ...(['team', 'combined'].includes(packageKind)
        ? [{ code: 'team_fee', label: sourceName('team', teamId), kind: 'team', amountCents: teamCents }]
        : []),
    ];
    try {
      await billingOperationsApi.saveBillingPackage(
        tenantId,
        {
          name: name.trim(),
          seasonId: seasonId || null,
          eligibleTeamIds: teamId ? [teamId] : [],
          currency: 'USD',
          lineItems,
          paymentTerms: {
            mode: paymentMode,
            adminChoiceConfirmed: true,
            installmentCount: paymentMode === 'installments' ? installmentCount : 1,
            cadence: paymentMode === 'installments' ? cadence : null,
            currency: 'usd',
            feeHandling,
            cashAccepted,
            discountsEnabled,
          },
          paymentPolicies: {
            cancellation: cancellationPolicy.trim(),
            refund: refundPolicy.trim(),
          },
          active,
          ...(editing ? { expectedVersion: editing.version } : {}),
        },
        createIdempotencyKey(editing ? 'billing-package-update' : 'billing-package-create'),
        editing?.id,
      );
      editorOpen = false;
      await loadPackages();
    } catch (error) {
      saveError = error instanceof BackendApiError
        ? error.message
        : 'Payment setup could not be saved.';
    } finally {
      saving = false;
    }
  }
</script>

<section class="rounded-xl border border-gray-200 bg-white shadow-sm" aria-labelledby="payment-setup-title">
  <header class="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 id="payment-setup-title" class="text-lg font-semibold text-gray-950">Payment setup</h2>
      <p class="mt-1 text-sm text-gray-600">Set season and team costs, then choose whether families may pay in full or split the total.</p>
    </div>
    <button type="button" class="crm-ui-button-primary" disabled={$seasonsStore.length === 0 && $teamsStore.length === 0} title={$seasonsStore.length === 0 && $teamsStore.length === 0 ? 'Create a season or team before adding payment setup.' : undefined} on:click={() => openEditor()}>Add payment setup</button>
  </header>
  {#if loading}
    <p class="p-6 text-sm text-gray-600" role="status">Loading payment setup…</p>
  {:else if loadError}
    <div class="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      {loadError}
      <button type="button" class="mt-3 crm-ui-button-secondary bg-white" on:click={loadPackages}>Retry</button>
    </div>
  {:else if packages.length === 0}
    <div class="p-6 text-sm text-gray-600"><p>No season or team payment setup has been added.</p>{#if $seasonsStore.length === 0 && $teamsStore.length === 0}<p class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">Create a season or team first so every payment setup has a valid offering scope.</p>{:else if $seasonsStore.length === 0}<p class="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">Season pricing remains unavailable until a season exists. You can still create team-scoped pricing.</p>{/if}</div>
  {:else}
    <div class="divide-y divide-gray-100">
      {#each packages as record (record.id)}
        <article class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="font-semibold text-gray-950">{record.name}</h3>
            <p class="mt-1 text-sm text-gray-600">
              {money(record.totalCents)} · {record.paymentTerms?.mode === 'installments' ? `${record.paymentTerms.installmentCount} payments` : 'Pay in full only'} · {record.active ? 'Active' : 'Inactive'}
            </p>
          </div>
          <button type="button" class="crm-ui-button-secondary bg-white" on:click={() => openEditor(record)}>Edit</button>
        </article>
      {/each}
    </div>
  {/if}
</section>

{#if editorOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" role="presentation">
    <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="package-editor-title">
      <header class="border-b border-gray-200 p-5">
        <h2 id="package-editor-title" class="text-xl font-semibold text-gray-950">{editing ? 'Edit payment setup' : 'Add payment setup'}</h2>
        <p class="mt-1 text-sm text-gray-600">Only information families and program staff need is shown here.</p>
      </header>
      <div class="space-y-5 p-5">
        <label class="block"><span class="crm-ui-label">Name</span><input class="crm-ui-input mt-1" bind:value={name} maxlength="120" placeholder="Fall season and team fee" /></label>
        <fieldset><legend class="crm-ui-label">Cost applies to</legend><div class="mt-2 grid gap-2 sm:grid-cols-3">{#each [['season','Season'],['team','Team'],['combined','Season + team']] as option}<label class="rounded-lg border border-gray-200 p-3 text-sm"><input type="radio" bind:group={packageKind} value={option[0]} /> <span class="ml-1">{option[1]}</span></label>{/each}</div></fieldset>
        {#if ['season', 'combined'].includes(packageKind)}<div class="grid gap-3 sm:grid-cols-2"><label><span class="crm-ui-label">Season</span><select class="crm-ui-input mt-1" bind:value={seasonId}><option value="">Choose season</option>{#each $seasonsStore as season}<option value={season.id}>{season.name || season.title || 'Unnamed season'}</option>{/each}</select></label><label><span class="crm-ui-label">Season amount</span><input class="crm-ui-input mt-1" inputmode="decimal" bind:value={seasonAmount} placeholder="1000.00" /></label></div>{/if}
        {#if ['team', 'combined'].includes(packageKind)}<div class="grid gap-3 sm:grid-cols-2"><label><span class="crm-ui-label">Team</span><select class="crm-ui-input mt-1" bind:value={teamId}><option value="">Choose team</option>{#each $teamsStore as team}<option value={team.id}>{team.name || team.title || 'Unnamed team'}</option>{/each}</select></label><label><span class="crm-ui-label">Team amount</span><input class="crm-ui-input mt-1" inputmode="decimal" bind:value={teamAmount} placeholder="250.00" /></label></div>{/if}
        <fieldset><legend class="crm-ui-label">How families may pay</legend><div class="mt-2 grid gap-2 sm:grid-cols-2"><label class="rounded-lg border border-gray-200 p-3 text-sm"><input type="radio" bind:group={paymentMode} value="pay_in_full" /> <span class="ml-1 font-medium">Pay in full only</span></label><label class="rounded-lg border border-gray-200 p-3 text-sm"><input type="radio" bind:group={paymentMode} value="installments" /> <span class="ml-1 font-medium">Allow split payments</span></label></div></fieldset>
        {#if paymentMode === 'installments'}<div class="grid gap-3 sm:grid-cols-2"><label><span class="crm-ui-label">Number of payments</span><select class="crm-ui-input mt-1" bind:value={installmentCount}>{#each Array.from({length: 11}, (_, i) => i + 2) as count}<option value={count}>{count}</option>{/each}</select></label><label><span class="crm-ui-label">Frequency</span><select class="crm-ui-input mt-1" bind:value={cadence}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>{/if}
        {#if installmentAmounts.length > 0}<div class="rounded-lg border border-[var(--crm-brand-border)] bg-[var(--crm-brand-surface)] p-4 text-[var(--crm-on-brand-surface)]"><p class="font-semibold">Family payment preview · {money(totalCents)} total</p><p class="mt-1 text-xs">Dates are calculated from each family’s enrollment date.</p><ol class="mt-2 grid gap-1 text-sm">{#each installmentAmounts as amount, index}<li>Payment {index + 1}: {money(amount)} · {paymentMode === 'pay_in_full' ? 'due at enrollment' : installmentTiming(index, installmentAmounts.length)}</li>{/each}</ol></div>{/if}
        <div class="grid gap-3 sm:grid-cols-2"><label><span class="crm-ui-label">Cancellation information</span><textarea class="crm-ui-input mt-1 min-h-24" bind:value={cancellationPolicy} maxlength="4000"></textarea></label><label><span class="crm-ui-label">Refund information</span><textarea class="crm-ui-input mt-1 min-h-24" bind:value={refundPolicy} maxlength="4000"></textarea></label></div>
        <details class="rounded-lg border border-gray-200 p-4"><summary class="cursor-pointer font-medium text-gray-900">More payment options</summary><div class="mt-4 space-y-3"><label class="block"><span class="crm-ui-label">Processing fees</span><select class="crm-ui-input mt-1" bind:value={feeHandling}><option value="organization_pays">Organization pays</option><option value="registrant_pays">Registrant pays</option></select></label><label class="flex gap-2 text-sm"><input type="checkbox" bind:checked={cashAccepted} /> Accept cash payments</label><label class="flex gap-2 text-sm"><input type="checkbox" bind:checked={discountsEnabled} /> Allow discounts</label><label class="flex gap-2 text-sm"><input type="checkbox" bind:checked={active} /> Available for new offers</label></div></details>
        {#if saveError}<p class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{saveError}</p>{/if}
      </div>
      <footer class="flex justify-end gap-2 border-t border-gray-200 p-4"><button type="button" class="crm-ui-button-secondary bg-white" disabled={saving} on:click={() => editorOpen = false}>Cancel</button><button type="button" class="crm-ui-button-primary" disabled={saving} on:click={savePackage}>{saving ? 'Saving…' : 'Save payment setup'}</button></footer>
    </div>
  </div>
{/if}
