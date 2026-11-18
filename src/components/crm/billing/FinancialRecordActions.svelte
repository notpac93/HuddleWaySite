<script lang="ts">
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey, type FinancialOperationRow } from '../../../lib/api/BackendApi';

  export let tenantId: string;
  export let row: FinancialOperationRow | null = null;
  export let onSaved: () => Promise<void>;

  type Action = 'refund' | 'receipt' | 'copy' | 'issue' | 'remind' | 'manual' | 'void' | 'reconcile' | 'create' | 'edit';
  const names: Record<Action, string> = {
    refund: 'Refund', receipt: 'Resend receipt', copy: 'Resend invoice copy',
    issue: 'Issue invoice', remind: 'Send reminder', manual: 'Record manual payment',
    void: 'Void invoice', reconcile: 'Reconcile invoice', create: 'New invoice', edit: 'Edit draft',
  };
  const auditReason = 'Confirmed by the program owner in Financials.';
  let actions: Action[] = [];
  let dialog: HTMLDialogElement;
  let selected: Action = 'create';
  let sending = false;
  let error = '';
  let amount: number | undefined;
  let method = 'cash';
  let received = '';
  let reference = '';
  let title = '';
  let email = '';
  let draftLines: Array<{ description: string; quantity: number; unitAmountCents: number }> = [];
  let paymentProvider = 'stripe';
  let dueDays = 30;
  let memo = '';
  let discountCents = 0;
  let taxRateBps = 0;
  let recipientUid = '';
  let savedEmail = '';
  let recipientName = '';
  let loadingDraft = false;
  let pending: (() => Promise<unknown>) | null = null;
  let message = '';
  let selection = 0;
  let dialogVersion = 0;
  $: actions = availableActions(row);
  $: maximum = selected === 'refund' ? row?.refundableCents : selected === 'manual' ? row?.balanceDueCents : null;
  $: draft = selected === 'create' || selected === 'edit';

  function availableActions(item: FinancialOperationRow | null): Action[] {
    if (!item) return ['create'];
    const result: Action[] = [];
    if ((item.refundableCents ?? 0) > 0 && (item.kind === 'invoice' ? item.directInvoiceId : item.transactionId)) result.push('refund');
    if (item.paymentId && item.status === 'succeeded') result.push('receipt');
    if (item.invoiceId) result.push('copy');
    if (item.directInvoiceId && item.kind !== 'transaction') {
      if (item.status === 'draft') result.push('edit', 'issue');
      if (['open', 'past_due'].includes(item.status)) result.push('remind');
      if (['open', 'past_due', 'partially_paid'].includes(item.status) && (item.balanceDueCents ?? 0) > 0) result.push('manual');
      if (['draft', 'issuing', 'open', 'past_due', 'partially_paid'].includes(item.status)) result.push('void');
      if (item.providerLinked) result.push('reconcile');
    }
    return result;
  }

  async function open(action: Action) {
    if (sending) return;
    const version = ++selection;
    dialogVersion = version;
    selected = action;
    error = '';
    message = '';
    pending = null;
    amount = action === 'refund' && row?.refundableCents ? row.refundableCents / 100 : undefined;
    title = '';
    email = '';
    reference = '';
    method = 'cash';
    received = '';
    draftLines = action === 'create' ? [{ description: '', quantity: 1, unitAmountCents: 0 }] : [];
    paymentProvider = 'stripe';
    dueDays = 30;
    memo = '';
    discountCents = 0;
    taxRateBps = 0;
    recipientUid = '';
    savedEmail = '';
    recipientName = '';
    loadingDraft = action === 'edit';
    dialog.showModal();
    if (action !== 'edit' || !row?.directInvoiceId) return;
    try {
      const { invoice } = await backendClient.directInvoiceLedger(tenantId, row.directInvoiceId);
      if (dialogVersion !== version) return;
      if (invoice.status !== 'draft') throw new Error('This invoice can no longer be edited.');
      title = invoice.title;
      email = invoice.recipientEmail || '';
      savedEmail = email;
      recipientName = invoice.recipientName || '';
      recipientUid = invoice.recipientUid || '';
      paymentProvider = invoice.paymentProvider || 'stripe';
      dueDays = invoice.dueDays || 30;
      memo = invoice.memo || '';
      discountCents = invoice.discountCents || 0;
      taxRateBps = invoice.taxRateBps || 0;
      draftLines = invoice.lineItems;
    } catch {
      if (dialogVersion === version) error = 'The draft could not be loaded. Close the dialog and try again.';
    } finally {
      if (dialogVersion === version) loadingDraft = false;
    }
  }

  function request(): () => Promise<unknown> {
    const key = createIdempotencyKey('finance');
    const tenant = tenantId;
    const item = row;
    const action = selected;
    const cents = Math.round(Number(amount) * 100);
    if (action === 'create' || action === 'edit') {
      const input = {
        tenantId: tenant, auditReason, title: title.trim(), recipientEmail: email.trim(),
        ...(email.trim() === savedEmail && recipientUid ? { recipientUid, recipientName } : {}), dueDays, memo, discountCents, taxRateBps,
        paymentProvider: paymentProvider === 'paypal' ? 'paypal' as const : 'stripe' as const,
        lineItems: draftLines.map((line) => ({ ...line, description: line.description.trim() })),
      };
      if (action === 'create') return () => backendClient.createDirectInvoice(input, key);
      const path = '/admin/direct-invoices/' + encodeURIComponent(item!.directInvoiceId!);
      return () => backendClient.financialOperation(tenant, path, 'PATCH', input, key);
    }
    if (!item) throw new Error('Select a financial record.');
    if (action === 'refund') {
      const input = { tenantId: tenant, amountCents: cents, reason: 'requested_by_customer' as const, note: auditReason, idempotencyKey: key };
      if (!Number.isSafeInteger(cents) || cents < 1 || cents > (item.refundableCents ?? 0)) throw new Error('Invalid refundable amount.');
      if (item.kind === 'invoice') return () => backendClient.refundDirectInvoice({ ...input, invoiceId: item.directInvoiceId! });
      return () => backendClient.refundTransaction({ ...input, transactionId: item.transactionId! });
    }
    if (action === 'receipt') return () => backendClient.resendPaymentReceipt(tenant, item.paymentId!, auditReason, key);
    if (action === 'copy') {
      const path = '/admin/billing/invoices/' + encodeURIComponent(item.invoiceId!) + '/resend-copy';
      return () => backendClient.financialOperation(tenant, path, 'POST', { auditReason }, key);
    }
    if (action === 'manual') {
      const input = {
        tenantId: tenant, invoiceId: item.directInvoiceId!, amountCents: cents,
        method: method as 'cash' | 'check' | 'bank_transfer' | 'other', reference: reference.trim(),
        receivedAt: new Date(received).toISOString(), auditReason, idempotencyKey: key,
      };
      return () => backendClient.recordManualPayment(input);
    }
    if (action === 'reconcile') return () => backendClient.reconcileDirectInvoice(tenant, item.directInvoiceId!, auditReason);
    return () => backendClient.directInvoiceAction(tenant, item.directInvoiceId!, action, key, auditReason);
  }

  async function submit() {
    if (sending || loadingDraft || (selected === 'edit' && !draftLines.length)) return;
    sending = true;
    error = '';
    try {
      pending ||= request();
      const result = await pending();
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error('Operation requires review.');
      }
      pending = null;
      dialog.close();
      message = 'Request completed. Check the record for its current status.';
      await onSaved();
    } catch (failure) {
      error = failure instanceof BackendApiError && failure.status < 500
        ? 'The operation was rejected. Refresh the record and check its current status.'
        : 'The result could not be confirmed. Retry this same request or refresh before making another change.';
    } finally {
      sending = false;
    }
  }
</script>

{#if actions.length === 1}
  <button type="button" class={row ? 'crm-ui-button-secondary' : 'crm-ui-button-primary'} on:click={() => open(actions[0])}>{names[actions[0]]}</button>
{:else if actions.length > 1}
  <details class="relative w-fit">
    <summary class="crm-ui-button-secondary cursor-pointer">Actions</summary>
    <div class="mt-2 grid min-w-48 divide-y rounded-lg border bg-white text-gray-900 shadow-sm">
      {#each actions as action}
        <button class="px-3 py-2 text-left hover:bg-gray-50" type="button" on:click={() => open(action)}>{names[action]}</button>
      {/each}
    </div>
  </details>
{/if}
{#if message}<p class="text-sm" role="status">{message}</p>{/if}
<dialog bind:this={dialog} class="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-auto rounded-xl bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/50"
  aria-label={names[selected]} on:close={() => { dialogVersion = 0; }}
  on:cancel={(event) => { if (sending) event.preventDefault(); }}>
  <form class="grid gap-3" on:submit|preventDefault={submit}>
    <h2 class="text-xl font-semibold">{names[selected]}</h2>
    {#if row}<p class="text-sm text-gray-600">{row.label}</p>{/if}
    <fieldset disabled={sending || Boolean(pending) || loadingDraft} class="grid gap-3">
      {#if draft}
        <label>Invoice title<input class="crm-ui-input w-full" bind:value={title} required maxlength="160" /></label>
        <label>Recipient email<input type="email" class="crm-ui-input w-full" bind:value={email} required={!recipientUid} /></label>
        {#each draftLines as item, index}
          <div class="grid gap-2 rounded-md border p-2">
            <label>Line item {index + 1}<input class="crm-ui-input w-full" bind:value={item.description} required /></label>
            <div class="flex flex-wrap gap-2">
              <label>Quantity<input type="number" min="1" max="1000" class="crm-ui-input block w-20" bind:value={item.quantity} required /></label>
              <label>Unit amount (USD)<input type="number" min="0" max="500000" step=".01" class="crm-ui-input block w-28" value={item.unitAmountCents / 100} on:input={(event) => { item.unitAmountCents = Math.round(event.currentTarget.valueAsNumber * 100); }} required /></label>
              {#if draftLines.length > 1}<button type="button" class="crm-ui-button-secondary self-end" on:click={() => draftLines = draftLines.filter((_, position) => index !== position)}>Remove item {index + 1}</button>{/if}
            </div>
          </div>
        {/each}
        <button type="button" class="crm-ui-button-secondary w-fit" disabled={draftLines.length >= 100} on:click={() => draftLines = [...draftLines, { description: '', quantity: 1, unitAmountCents: 0 }]}>Add line item</button>
        <div class="flex flex-wrap gap-2">
          <label>Discount (USD)<input class="crm-ui-input block w-28" type="number" min="0" step=".01" value={discountCents / 100} on:input={(event) => discountCents = Math.round((event.currentTarget.valueAsNumber || 0) * 100)} /></label>
          <label>Tax rate (%)<input class="crm-ui-input block w-28" type="number" min="0" max="100" step=".01" value={taxRateBps / 100} on:input={(event) => taxRateBps = Math.round((event.currentTarget.valueAsNumber || 0) * 100)} /></label>
        </div>
        <label>Memo<textarea class="crm-ui-input w-full" bind:value={memo} maxlength="2000"></textarea></label>
        <label>Due in days<input type="number" min="1" max="90" class="crm-ui-input w-full" bind:value={dueDays} required /></label>
        <label>Payment provider<select class="crm-ui-input w-full" bind:value={paymentProvider}><option value="stripe">Stripe</option><option value="paypal">PayPal</option></select></label>
      {/if}
      {#if selected === 'refund' || selected === 'manual'}
        <label>Amount ({row?.currency || 'USD'})<input type="number" min="0.01" step="0.01" max={maximum == null ? undefined : maximum / 100} class="crm-ui-input w-full" bind:value={amount} required /></label>
      {/if}
      {#if selected === 'manual'}
        <label>Method<select class="crm-ui-input w-full" bind:value={method}><option value="cash">Cash</option><option value="check">Check</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
        <label>Received at<input type="datetime-local" class="crm-ui-input w-full" bind:value={received} required /></label>
        <label>Payment reference<input class="crm-ui-input w-full" bind:value={reference} required /></label>
      {/if}
    </fieldset>
    {#if loadingDraft}<p role="status">Loading draft…</p>{/if}
    {#if error}<p class="text-sm text-red-800" role="alert">{error}</p>{/if}
    <div class="flex flex-wrap justify-end gap-2">
      <button type="button" class="crm-ui-button-secondary" disabled={sending} on:click={() => dialog.close()}>Cancel</button>
      <button type="submit" class="crm-ui-button-primary" disabled={sending || loadingDraft || (selected === 'edit' && !draftLines.length)}>{sending ? 'Submitting…' : pending ? 'Retry request' : names[selected]}</button>
    </div>
  </form>
</dialog>
