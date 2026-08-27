<script lang="ts">
  import { onMount } from 'svelte';
  import { activeTenantRole, tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey, type ParticipantInstallmentAgreement, type ParticipantRelationships, type RosterPlayerRecord } from '../../../lib/api/BackendApi';

  export let player: RosterPlayerRecord;
  export let onClose: () => void = () => {};
  export let onChanged: () => void = () => {};

  let relationships: ParticipantRelationships | null = null;
  let agreements: ParticipantInstallmentAgreement[] = [];
  let loading = true;
  let errorMessage = '';
  let requestId = '';
  let stagedTeamId = '';
  let publishing = false;
  let technicalOpen = false;
  let technicalLoading = false;
  let technicalEntries: Array<{ label: string; value: string }> = [];
  let editingAgreement: ParticipantInstallmentAgreement | null = null;
  let revisionAction: 'replace_future' | 'resume' | 'pause' | 'waive_remaining' | 'cancel_remaining' = 'replace_future';
  let revisionReason = '';
  let notifyCustomer = true;
  let revisionRows: Array<{ amount: string; dueDate: string }> = [];
  let revisionSaving = false;

  $: isOwner = $activeTenantRole === 'owner' || $activeTenantRole === 'platform_admin';
  $: selectedTeamName = stagedTeamId === 'unassigned'
    ? 'Unassigned'
    : relationships?.options.find((option) => option.teamId === stagedTeamId)?.name || '';
  $: hasDraft = Boolean(stagedTeamId);

  onMount(loadDetails);

  async function loadDetails() {
    if (!$tenantIdStore || !player.participantId) {
      loading = false;
      return;
    }
    loading = true;
    errorMessage = '';
    requestId = '';
    const tenantId = $tenantIdStore;
    try {
      const [relationshipResult, agreementResult] = await Promise.all([
        backendClient.participantRelationships(tenantId, player.participantId, player.id),
        backendClient.participantInstallmentAgreements(tenantId, player.participantId),
      ]);
      if ($tenantIdStore !== tenantId) return;
      relationships = relationshipResult;
      agreements = agreementResult;
    } catch (error) {
      errorMessage = 'Participant details could not be loaded.';
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    } finally {
      if ($tenantIdStore === tenantId) loading = false;
    }
  }

  async function publishAssignment() {
    if (!$tenantIdStore || !hasDraft || !relationships?.canAssign) return;
    publishing = true;
    errorMessage = '';
    requestId = '';
    const tenantId = $tenantIdStore;
    const destinationTeamId = stagedTeamId === 'unassigned' ? null : stagedTeamId;
    const key = createIdempotencyKey('participant-team-assignment');
    try {
      const preview = await backendClient.previewRosterTransfer(tenantId, [player.id], destinationTeamId);
      await backendClient.commitRosterTransfer(tenantId, preview, key);
      stagedTeamId = '';
      await loadDetails();
      onChanged();
    } catch (error) {
      errorMessage = 'The reviewed team change could not be published. Nothing was changed locally.';
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    } finally {
      publishing = false;
    }
  }

  async function openTechnicalDetails() {
    if (!$tenantIdStore || !player.participantId || !isOwner || technicalLoading) return;
    technicalOpen = true;
    technicalLoading = true;
    try {
      const result = await backendClient.participantTechnicalDetails($tenantIdStore, player.participantId, player.id);
      technicalEntries = result.entries;
    } catch (error) {
      errorMessage = 'Technical details could not be loaded.';
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    } finally {
      technicalLoading = false;
    }
  }

  function money(cents: number, currency: unknown) {
    const code = String(currency || 'USD').toUpperCase();
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(cents / 100);
  }

  function startRevision(agreement: ParticipantInstallmentAgreement) {
    editingAgreement = agreement;
    revisionAction = agreement.status === 'paused' ? 'resume' : 'replace_future';
    revisionReason = '';
    notifyCustomer = true;
    revisionRows = agreement.installments
      .filter((item) => ['pending', 'failed', 'paused'].includes(item.status))
      .map((item) => ({ amount: (item.amountCents / 100).toFixed(2), dueDate: item.dueDate }));
  }

  async function saveRevision() {
    if (!$tenantIdStore || !player.participantId || !editingAgreement || !revisionReason.trim()) return;
    const futureInstallments = ['pause', 'waive_remaining', 'cancel_remaining'].includes(revisionAction)
      ? []
      : revisionRows.map((row) => ({ amountCents: Math.round(Number(row.amount) * 100), dueDate: row.dueDate }));
    if (futureInstallments.some((item) => !Number.isSafeInteger(item.amountCents) || item.amountCents < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate))) {
      errorMessage = 'Every future payment needs a valid amount and date.';
      return;
    }
    revisionSaving = true;
    errorMessage = '';
    try {
      await backendClient.proposeParticipantInstallmentRevision({
        tenantId: $tenantIdStore,
        participantId: player.participantId,
        agreementId: editingAgreement.id,
        data: {
          expectedRevision: editingAgreement.revision,
          action: revisionAction,
          futureInstallments,
          reason: revisionReason.trim(),
          notifyCustomer,
        },
        idempotencyKey: createIdempotencyKey('participant-installment-revision'),
      });
      editingAgreement = null;
      await loadDetails();
    } catch (error) {
      errorMessage = 'The payment change was saved only if the server confirmed it. Review the current plan before retrying.';
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    } finally {
      revisionSaving = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="presentation" on:click|self={onClose}>
  <div class="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="participant-title">
    <header class="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 bg-white px-5 py-4">
      <div><h2 id="participant-title" class="text-xl font-bold text-gray-950">{player.name}</h2><p class="text-sm text-gray-600">Participant details</p></div>
      <button type="button" class="rounded-md px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100" on:click={onClose}>Close</button>
    </header>
    <div class="space-y-5 p-5">
      {#if !player.participantId}
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert"><strong>Identity repair needed.</strong> This older registration does not have one stable participant identity, so billing and team changes are unavailable.</div>
      {:else if loading}
        <p class="rounded-lg border border-gray-200 p-5 text-sm text-gray-600" role="status">Loading participant details…</p>
      {:else}
        {#if errorMessage}<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{errorMessage}{#if requestId}<span class="block text-xs">Support request: {requestId}</span>{/if}</div>{/if}

        <section class="rounded-xl border border-gray-200 p-4"><h3 class="font-semibold text-gray-950">Contacts</h3><dl class="mt-3 grid gap-2 text-sm"><div><dt class="text-gray-500">Primary email</dt><dd class="font-medium text-gray-900">{player.email || 'Not recorded'}</dd></div></dl></section>

        <section class="rounded-xl border border-gray-200 p-4">
          <h3 class="font-semibold text-gray-950">Teams</h3>
          {#if relationships?.relationships.length}
            <ul class="mt-3 space-y-2">{#each relationships.relationships as item}<li class="rounded-lg bg-gray-50 p-3 text-sm"><strong>{item.name}</strong>{#if item.division}<span class="block text-gray-600">{item.division}</span>{/if}<span class="block text-gray-600">{item.role} · {item.status}{#if item.availability} · {item.availability}{/if}</span></li>{/each}</ul>
          {:else}<p class="mt-2 text-sm text-gray-600">Unassigned</p>{/if}
          {#if relationships}
            <div class="mt-4 border-t border-gray-100 pt-4">
              <label><span class="text-sm font-medium text-gray-800">Stage a team change</span><select class="crm-ui-input mt-1 bg-white" bind:value={stagedTeamId} disabled={!relationships.canAssign || publishing}><option value="">No staged change</option><option value="unassigned">Unassigned</option>{#each relationships.options as option}<option value={option.teamId}>{option.name}{option.division ? ` — ${option.division}` : ''}</option>{/each}</select></label>
              {#if relationships.assignmentBlockedReason}<p class="mt-2 text-sm text-amber-800">{relationships.assignmentBlockedReason}</p>{/if}
              {#if hasDraft}<p class="mt-2 text-sm text-blue-800">Staged: {selectedTeamName}. Nothing changes until Publish.</p>{/if}
              <div class="mt-3 flex gap-2"><button type="button" class="crm-ui-button-secondary bg-white" disabled={!hasDraft || publishing} on:click={() => stagedTeamId = ''}>Revert</button><button type="button" class="crm-ui-button-primary" disabled={!hasDraft || publishing || !relationships.canAssign} on:click={publishAssignment}>{publishing ? 'Publishing…' : 'Publish'}</button></div>
            </div>
          {/if}
        </section>

        <section class="rounded-xl border border-gray-200 p-4"><h3 class="font-semibold text-gray-950">Registrations</h3><p class="mt-2 text-sm text-gray-700">{player.status} registration</p></section>

        <section class="rounded-xl border border-gray-200 p-4">
          <h3 class="font-semibold text-gray-950">Billing</h3>
          {#if agreements.length === 0}<p class="mt-2 text-sm text-gray-600">No split-payment plan is connected to this participant.</p>{:else}<div class="mt-3 space-y-3">{#each agreements as agreement}<article class="rounded-lg bg-gray-50 p-3"><p class="text-sm font-semibold text-gray-950">{String(agreement.offering?.label || agreement.offering?.type || 'Payment plan')}</p><p class="text-xs text-gray-600">{agreement.status.replaceAll('_', ' ')} · revision {agreement.revision}</p><ul class="mt-2 space-y-1">{#each agreement.installments as installment}<li class="flex justify-between gap-3 text-sm"><span>{installment.dueDateLabel || installment.dueDate} · {installment.status.replaceAll('_', ' ')}</span><strong>{money(installment.amountCents, agreement.terms?.currency)}</strong></li>{/each}</ul><button type="button" class="mt-3 text-sm font-semibold text-blue-700" disabled={Boolean(agreement.pendingRevision)} on:click={() => startRevision(agreement)}>{agreement.pendingRevision ? 'Payment change pending' : 'Manage future payments'}</button></article>{/each}</div>{/if}
          {#if editingAgreement}
            <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 class="font-semibold text-blue-950">Change future payments</h4>
              <label class="mt-3 block"><span class="text-sm font-medium">Action</span><select class="crm-ui-input mt-1 bg-white" bind:value={revisionAction}><option value={editingAgreement.status === 'paused' ? 'resume' : 'replace_future'}>{editingAgreement.status === 'paused' ? 'Resume with these dates' : 'Edit amounts or dates'}</option>{#if editingAgreement.status !== 'paused'}<option value="pause">Pause future billing</option>{/if}<option value="waive_remaining">Waive remaining balance</option><option value="cancel_remaining">Cancel remaining payments</option></select></label>
              {#if ['replace_future', 'resume'].includes(revisionAction)}<div class="mt-3 space-y-2">{#each revisionRows as row, index}<div class="grid grid-cols-2 gap-2"><label><span class="text-xs font-medium">Payment {index + 1}</span><input class="crm-ui-input mt-1 bg-white" inputmode="decimal" bind:value={row.amount} /></label><label><span class="text-xs font-medium">Due date</span><input class="crm-ui-input mt-1 bg-white" type="date" bind:value={row.dueDate} /></label></div>{/each}</div>{/if}
              <label class="mt-3 block"><span class="text-sm font-medium">Reason</span><textarea class="crm-ui-input mt-1 bg-white" rows="2" maxlength="1000" bind:value={revisionReason}></textarea></label>
              <label class="mt-3 flex gap-2 text-sm"><input type="checkbox" bind:checked={notifyCustomer} /> Notify the customer</label>
              <p class="mt-2 text-xs text-blue-900">Paid or processing payments never change. An increase or earlier collection requires the customer’s approval before becoming effective.</p>
              <div class="mt-3 flex gap-2"><button type="button" class="crm-ui-button-secondary bg-white" disabled={revisionSaving} on:click={() => editingAgreement = null}>Cancel</button><button type="button" class="crm-ui-button-primary" disabled={revisionSaving || !revisionReason.trim()} on:click={saveRevision}>{revisionSaving ? 'Saving…' : 'Save change'}</button></div>
            </div>
          {/if}
        </section>

        {#if isOwner}
          <section class="rounded-xl border border-gray-200 p-4"><button type="button" class="text-sm font-semibold text-blue-700" on:click={openTechnicalDetails}>{technicalOpen ? 'Refresh technical details' : 'Open technical details'}</button><p class="mt-1 text-xs text-gray-500">Internal identifiers are hidden unless an owner explicitly opens them.</p>{#if technicalOpen}<dl class="mt-3 space-y-2 text-xs">{#if technicalLoading}<p role="status">Loading…</p>{:else}{#each technicalEntries as entry}<div><dt class="font-semibold text-gray-600">{entry.label}</dt><dd class="break-all text-gray-900">{entry.value}</dd></div>{/each}{/if}</dl>{/if}</section>
        {/if}
      {/if}
    </div>
  </div>
</div>
