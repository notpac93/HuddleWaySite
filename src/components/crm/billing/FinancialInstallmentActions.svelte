<script lang="ts">
  import { backendClient } from '../../../lib/api/backendClient';
  import { createIdempotencyKey } from '../../../lib/api/BackendApi';

  export let tenantId: string;
  export let participantId: string;
  export let agreementId: string;
  export let onSaved: () => Promise<void>;

  type Installment = { number: number; dueAt: string; dueDate: string; amountCents: number; status: string };
  type Agreement = { id: string; revision: number; status: string; currency?: string; pendingRevision: unknown; installments: Installment[] };
  let dialog: HTMLDialogElement;
  let agreement: Agreement | null = null;
  let schedule: Array<{ dueDate: string; amount: number }> = [];
  let action = '';
  let reason = '';
  let note = '';
  let loading = false;
  let saving = false;
  let retry: { key: string; body: Record<string, unknown> } | null = null;
  let generation = 0;
  $: activeInstallments = agreement?.installments.filter((item) => ['pending', 'failed', 'paused'].includes(item.status)) || [];
  $: mayChange = Boolean(agreement && !agreement.pendingRevision && activeInstallments.length &&
    (agreement.status === 'paused' || activeInstallments.every((item) => item.status !== 'failed' && Date.parse(item.dueAt) > Date.now() + 300000)));

  function path() {
    return '/admin/participants/' + encodeURIComponent(participantId) + '/installment-agreements';
  }

  async function open() {
    const request = ++generation;
    agreement = null;
    schedule = [];
    action = '';
    reason = '';
    note = '';
    retry = null;
    loading = true;
    dialog.showModal();
    try {
      const payload = await backendClient.financialOperation(tenantId, path(), 'GET');
      if (request !== generation) return;
      agreement = (payload.agreements as Agreement[]).find((item) => item.id === agreementId) || null;
      if (!agreement) note = 'The installment plan is unavailable.';
      schedule = (agreement?.installments || []).filter((item) => ['pending', 'paused'].includes(item.status))
        .map((item) => ({ dueDate: item.dueDate, amount: item.amountCents / 100 }));
    } catch {
      if (request === generation) note = 'The installment plan could not be loaded.';
    } finally {
      if (request === generation) loading = false;
    }
  }

  async function save() {
    if (!agreement || !mayChange || saving) return;
    saving = true;
    note = '';
    try {
      retry ||= {
        key: createIdempotencyKey('finance-agreement'),
        body: {
          action, reason: reason.trim(), expectedRevision: agreement.revision, notifyCustomer: true,
          futureInstallments: ['replace_future', 'resume'].includes(action)
            ? schedule.map((item) => ({ dueDate: item.dueDate, amountCents: Math.round(item.amount * 100) })) : [],
        },
      };
      const result = await backendClient.financialOperation(
        tenantId, path() + '/' + encodeURIComponent(agreement.id) + '/revisions', 'POST', retry.body, retry.key,
      );
      agreement = result.agreement as Agreement;
      note = result.providerSync === 'confirmed'
        ? 'The change was confirmed.'
        : 'Proposal received. Check the plan for approval and provider status.';
      retry = null;
      action = '';
      await onSaved();
    } catch {
      note = 'The result could not be confirmed. Retry this same request or refresh the plan.';
    } finally {
      saving = false;
    }
  }
</script>

<button type="button" class="crm-ui-button-secondary" on:click={open}>Manage installment plan</button>
<dialog bind:this={dialog} aria-label="Installment plan" class="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-xl bg-white p-5 text-gray-900 backdrop:bg-black/50"
  on:cancel={(event) => { if (saving) event.preventDefault(); }} on:close={() => generation++}>
  <form on:submit|preventDefault={save} class="grid gap-3">
    <h2 class="text-lg font-semibold">Installment plan</h2>
    {#if loading}<p role="status">Loading installment plan…</p>{/if}
    {#if agreement}
      <p class="text-sm">Status · {agreement.status.replaceAll('_', ' ')}</p>
      <ol class="divide-y text-sm">
        {#each agreement.installments as installment}
          <li class="flex flex-wrap justify-between gap-2 py-2">
            <span>{installment.dueDate} · {installment.status.replaceAll('_', ' ')}</span>
            <span>{(installment.amountCents / 100).toFixed(2)}</span>
          </li>
        {/each}
      </ol>
      {#if mayChange}
        <fieldset disabled={saving || Boolean(retry)} class="grid gap-3">
          <label>Plan change<select class="crm-ui-input block w-full" bind:value={action} required>
            <option value="">Choose a change</option>
            {#if agreement.status === 'paused'}
              <option value="resume">Resume plan</option>
            {:else}
              <option value="replace_future">Revise future installments</option>
              <option value="pause">Pause plan</option>
            {/if}
            <option value="waive_remaining">Waive remaining balance</option>
            <option value="cancel_remaining">Cancel remaining installments</option>
          </select></label>
          {#if ['replace_future', 'resume'].includes(action)}
            {#each schedule as installment, index}
              <div class="flex flex-wrap gap-2">
                <label>Payment {index + 1} due<input type="date" class="crm-ui-input block" bind:value={installment.dueDate} required /></label>
                <label>Amount<input type="number" min="0.01" step="0.01" class="crm-ui-input block w-28" bind:value={installment.amount} required /></label>
              </div>
            {/each}
          {/if}
          {#if action}<label>Reason<textarea class="crm-ui-input block w-full" bind:value={reason} required></textarea></label>{/if}
        </fieldset>
      {:else}<p class="text-sm">This plan cannot accept a new change yet.</p>{/if}
    {/if}
    {#if note}<p class="text-sm" role="status">{note}</p>{/if}
    <div class="flex justify-end gap-2">
      <button type="button" class="crm-ui-button-secondary" disabled={saving} on:click={() => dialog.close()}>Done</button>
      {#if action && mayChange}<button type="submit" class="crm-ui-button-primary" disabled={saving}>{saving ? 'Submitting…' : retry ? 'Retry request' : 'Submit proposal'}</button>{/if}
    </div>
  </form>
</dialog>
