<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import {
    BackendApiError,
    createIdempotencyKey,
    type DirectInvoiceRecord,
    type DirectInvoiceProviderAccounting,
  } from '../../lib/api/BackendApi';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    dateLabel,
    directInvoiceActions,
    formatMinorUnits,
    humanizeStatus,
    parseMajorUnitInput,
    parsePercentToBasisPoints,
    refundableCoreTransactionCents,
    safeCurrency,
    safeHttpsUrl,
    safeMinorUnits,
    type FinanceRecord,
    type FinanceTableRow,
  } from '../../lib/finance/crmFinancials';

  export let open = false;
  export let row: FinanceTableRow | null = null;
  export let createMode = false;
  export let tenantId: string | null = null;
  export let ownerAuthorized = false;

  type Operation =
    | 'issue'
    | 'remind'
    | 'manual_payment'
    | 'invoice_refund'
    | 'core_refund'
    | 'void';
  type SubmitState = 'idle' | 'loading' | 'success' | 'error';
  type DraftLine = {
    key: string;
    description: string;
    quantity: number;
    unitAmount: string;
  };

  const dispatch = createEventDispatcher();
  let workingInvoice: DirectInvoiceRecord | null = null;
  let ledger:
    | {
        events: FinanceRecord[];
        payments: FinanceRecord[];
        refunds: FinanceRecord[];
        providerAccounting: DirectInvoiceProviderAccounting | null;
        truncated: {
          events: boolean;
          payments: boolean;
          refunds: boolean;
        };
        limits: {
          events: number;
          payments: number;
          refunds: number;
        };
        requestId: string;
      }
    | null = null;
  let ledgerState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let ledgerError = '';
  let operation: Operation | null = null;
  let operationKey = '';
  let operationKeySignature = '';
  let auditReason = '';
  let amountInput = '';
  let paymentMethod: 'cash' | 'check' | 'bank_transfer' | 'other' = 'check';
  let paymentReference = '';
  let receivedAt = '';
  let providerReason: 'duplicate' | 'fraudulent' | 'requested_by_customer' =
    'requested_by_customer';
  let impactConfirmed = false;
  let submitState: SubmitState = 'idle';
  let submitMessage = '';
  let requestId = '';
  let lastPanelIdentity = '';
  let ledgerGeneration = 0;
  let commandGeneration = 0;

  let draftRecipientEmail = '';
  let draftRecipientName = '';
  let draftTitle = '';
  let draftMemo = '';
  let draftDueDays = 30;
  let draftDiscount = '0.00';
  let draftTaxPercent = '0';
  let draftLines: DraftLine[] = [];
  let draftKeySignature = '';

  $: directInvoice =
    row?.kind === 'direct_invoice'
      ? workingInvoice ?? (row.original as unknown as DirectInvoiceRecord)
      : null;
  $: invoiceCapabilities = directInvoice
    ? directInvoiceActions(directInvoice)
    : null;
  $: safeHostedInvoiceUrl = safeHttpsUrl(directInvoice?.hostedInvoiceUrl);
  $: safeInvoicePdfUrl = safeHttpsUrl(directInvoice?.invoicePdfUrl);
  $: coreRefundable =
    row?.kind === 'transaction' || row?.kind === 'dispute'
      ? refundableCoreTransactionCents(row.original as FinanceRecord)
      : null;
  $: panelIdentity = `${open}:${tenantId || ''}:${createMode}:${row?.kind || ''}:${row?.id || ''}`;
  $: if (panelIdentity !== lastPanelIdentity) {
    lastPanelIdentity = panelIdentity;
    if (open) initializePanel();
    else invalidatePanel();
  }

  $: draftPreview = calculateDraftPreview(
    draftLines,
    draftDiscount,
    draftTaxPercent,
  );

  onDestroy(invalidatePanel);

  function newDraftLine(): DraftLine {
    return {
      key: createIdempotencyKey('invoice-line'),
      description: '',
      quantity: 1,
      unitAmount: '',
    };
  }

  function initializePanel() {
    ledgerGeneration += 1;
    commandGeneration += 1;
    workingInvoice =
      row?.kind === 'direct_invoice'
        ? (row.original as unknown as DirectInvoiceRecord)
        : null;
    ledger = null;
    ledgerState = 'idle';
    ledgerError = '';
    operation = null;
    operationKey = '';
    operationKeySignature = '';
    auditReason = '';
    amountInput = '';
    paymentMethod = 'check';
    paymentReference = '';
    receivedAt = toLocalDateTime(new Date());
    providerReason = 'requested_by_customer';
    impactConfirmed = false;
    submitState = 'idle';
    submitMessage = '';
    requestId = '';

    if (createMode) {
      draftRecipientEmail = '';
      draftRecipientName = '';
      draftTitle = '';
      draftMemo = '';
      draftDueDays = 30;
      draftDiscount = '0.00';
      draftTaxPercent = '0';
      draftLines = [newDraftLine()];
      draftKeySignature = '';
    } else if (row?.kind === 'direct_invoice') {
      void prepareInvoiceDetails();
    }
  }

  function invalidatePanel() {
    ledgerGeneration += 1;
    commandGeneration += 1;
  }

  function toLocalDateTime(date: Date) {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function close() {
    if (submitState === 'loading') return;
    invalidatePanel();
    dispatch('close');
  }

  function beginOperation(nextOperation: Operation) {
    operation = nextOperation;
    operationKey = '';
    operationKeySignature = '';
    auditReason = '';
    amountInput =
      nextOperation === 'manual_payment' && directInvoice
        ? (directInvoice.amountDueCents / 100).toFixed(2)
        : nextOperation === 'invoice_refund' && invoiceCapabilities
          ? (invoiceCapabilities.refundableCents / 100).toFixed(2)
          : (coreRefundable ?? 0) > 0
            ? ((coreRefundable ?? 0) / 100).toFixed(2)
            : '';
    paymentMethod = 'check';
    paymentReference = '';
    receivedAt = toLocalDateTime(new Date());
    providerReason = 'requested_by_customer';
    impactConfirmed = false;
    submitState = 'idle';
    submitMessage = '';
    requestId = '';
  }

  function cancelOperation() {
    if (submitState === 'loading') return;
    commandGeneration += 1;
    operation = null;
    submitState = 'idle';
    submitMessage = '';
    requestId = '';
  }

  function errorMessage(error: unknown, fallback: string) {
    if (error instanceof BackendApiError) {
      requestId = error.requestId || '';
    } else {
      requestId = '';
    }
    return fallback;
  }

  async function prepareInvoiceDetails() {
    if (
      directInvoice?.accountingReconciliationRequired !== true
      || !ownerAuthorized
      || !tenantId
    ) {
      await loadLedger();
      return;
    }
    const requestedTenantId = tenantId;
    const requestedInvoiceId = directInvoice.id;
    const generation = ++ledgerGeneration;
    ledgerState = 'loading';
    ledgerError = '';
    try {
      const reconciled = await backendClient.reconcileDirectInvoice(
        requestedTenantId,
        requestedInvoiceId,
        'Refresh authoritative Stripe totals before viewing this legacy invoice.',
      );
      if (
        generation !== ledgerGeneration
        || !open
        || tenantId !== requestedTenantId
        || (row?.recordId || row?.id) !== requestedInvoiceId
      ) return;
      workingInvoice = reconciled;
      dispatch('changed', {
        invoice: reconciled,
        kind: 'direct_invoice',
        id: requestedInvoiceId,
      });
      await loadLedger();
    } catch (error) {
      if (
        generation !== ledgerGeneration
        || !open
        || tenantId !== requestedTenantId
        || (row?.recordId || row?.id) !== requestedInvoiceId
      ) return;
      ledgerState = 'error';
      ledgerError = errorMessage(
        error,
        'Stripe totals could not be reconciled safely. Refunds remain disabled until the provider record is complete.',
      );
    }
  }

  async function loadLedger() {
    if (!tenantId || !directInvoice?.id) return;
    const requestedTenantId = tenantId;
    const requestedInvoiceId = directInvoice.id;
    const generation = ++ledgerGeneration;
    ledgerState = 'loading';
    ledgerError = '';
    try {
      const result = await backendClient.directInvoiceLedger(
        requestedTenantId,
        requestedInvoiceId,
      );
      if (
        generation !== ledgerGeneration
        || !open
        || tenantId !== requestedTenantId
        || (row?.recordId || row?.id) !== requestedInvoiceId
        || result.tenantId !== requestedTenantId
        || result.invoice.id !== requestedInvoiceId
      ) return;
      workingInvoice = result.invoice;
      ledger = result;
      ledgerState = 'ready';
    } catch (error) {
      if (
        generation !== ledgerGeneration
        || !open
        || tenantId !== requestedTenantId
        || (row?.recordId || row?.id) !== requestedInvoiceId
      ) return;
      ledgerState = 'error';
      ledgerError = errorMessage(
        error,
        'The invoice ledger could not be loaded. Retry or contact support if the problem continues.',
      );
    }
  }

  function operationValidation(): string {
    if (!ownerAuthorized) return 'Only an organization owner can perform financial operations.';
    if (!tenantId) return 'Choose an organization before continuing.';
    if (!row?.id || !operation) return 'Choose a financial operation.';
    if (auditReason.trim().length < 3 || auditReason.trim().length > 500) {
      return 'Enter an audit reason between 3 and 500 characters.';
    }
    if (!impactConfirmed) return 'Confirm that you reviewed the impact.';

    if (
      ['manual_payment', 'invoice_refund', 'core_refund'].includes(operation)
    ) {
      const cents = parseMajorUnitInput(amountInput);
      if (cents === null || cents < 1) {
        return 'Enter a valid amount with no more than two decimal places.';
      }
      if (
        operation === 'manual_payment'
        && directInvoice
        && cents > directInvoice.amountDueCents
      ) {
        return 'The payment cannot exceed the authoritative invoice balance.';
      }
      if (
        operation === 'manual_payment'
        && directInvoice?.stripeInvoiceId
        && cents !== directInvoice.amountDueCents
      ) {
        return 'Stripe-hosted invoices require a full out-of-band payment.';
      }
      if (
        operation === 'invoice_refund'
        && cents > (invoiceCapabilities?.refundableCents ?? 0)
      ) {
        return 'The refund cannot exceed the authoritative refundable balance.';
      }
      if (
        operation === 'core_refund'
        && cents > (coreRefundable ?? 0)
      ) {
        return 'The refund cannot exceed the authoritative refundable balance.';
      }
    }
    if (
      operation === 'manual_payment'
      && paymentReference.trim().length < 1
    ) {
      return 'Enter a receipt, check, transfer, or internal reference.';
    }
    if (operation === 'manual_payment') {
      const received = new Date(receivedAt);
      if (
        Number.isNaN(received.getTime())
        || received.getTime() > Date.now() + 5 * 60_000
      ) {
        return 'Enter a valid received date that is not in the future.';
      }
    }
    if (
      ['manual_payment', 'invoice_refund', 'core_refund'].includes(operation)
      && !safeCurrency(
        directInvoice?.currency || (row?.original as FinanceRecord | undefined)?.currency,
      )
    ) {
      return 'The authoritative currency is unavailable. This amount operation cannot continue.';
    }
    return '';
  }

  function operationImpact(): string {
    if (!operation || !row) return '';
    const currency = safeCurrency(
      directInvoice?.currency || (row.original as FinanceRecord).currency,
    );
    if (!currency) return 'Amount impact unavailable because the authoritative currency is missing.';
    const amount = formatMinorUnits(parseMajorUnitInput(amountInput), currency);
    if (operation === 'issue') {
      return 'Stripe will finalize this draft, create a hosted payment link, and email the recipient. The invoice can no longer be edited.';
    }
    if (operation === 'remind') {
      return 'A new payment reminder will be emailed using the existing hosted invoice link. No balance or payment status will change.';
    }
    if (operation === 'manual_payment') {
      return `${amount} will be recorded as ${paymentMethod.replace('_', ' ')} received outside the processor. The invoice balance will decrease after server reconciliation.`;
    }
    if (operation === 'invoice_refund') {
      return `${amount} will be requested from Stripe. The original payment remains in the ledger and the invoice may enter partial-refund or refund reconciliation.`;
    }
    if (operation === 'core_refund') {
      return `${amount} will be requested from Stripe. A dispute, if present, remains a separate processor case and is not closed by this refund.`;
    }
    return 'The invoice will be voided and its remaining balance set to zero. This cannot be reversed.';
  }

  function operationPayloadSignature() {
    return JSON.stringify({
      tenantId,
      recordId: row?.recordId || row?.id || '',
      operation,
      auditReason: auditReason.trim(),
      amountCents: ['manual_payment', 'invoice_refund', 'core_refund'].includes(
        operation || '',
      )
        ? parseMajorUnitInput(amountInput)
        : null,
      paymentMethod: operation === 'manual_payment' ? paymentMethod : '',
      paymentReference:
        operation === 'manual_payment' ? paymentReference.trim() : '',
      receivedAt:
        operation === 'manual_payment'
          ? new Date(receivedAt).toISOString()
          : '',
      providerReason:
        operation === 'invoice_refund' || operation === 'core_refund'
          ? providerReason
          : '',
    });
  }

  async function submitOperation() {
    if (submitState === 'loading' || submitState === 'success') return;
    const validation = operationValidation();
    if (validation || !operation || !row || !tenantId) {
      submitState = 'error';
      submitMessage = validation || 'The financial operation is incomplete.';
      return;
    }

    const submittedOperation = operation;
    const submittedTenantId = tenantId;
    const submittedRecordId = row.recordId || row.id;
    const submittedKind = row.kind;
    const submittedPanelIdentity = panelIdentity;
    const payloadSignature = operationPayloadSignature();
    if (payloadSignature !== operationKeySignature) {
      operationKeySignature = payloadSignature;
      operationKey = createIdempotencyKey(
        `${submittedOperation}-${submittedRecordId}`,
      );
    }
    const submittedOperationKey = operationKey;
    const generation = ++commandGeneration;
    const submittedAmountCents = parseMajorUnitInput(amountInput);
    const submittedAuditReason = auditReason.trim();
    const submittedPaymentMethod = paymentMethod;
    const submittedPaymentReference = paymentReference.trim();
    const submittedReceivedAt =
      submittedOperation === 'manual_payment'
        ? new Date(receivedAt).toISOString()
        : '';
    const submittedProviderReason = providerReason;
    submitState = 'loading';
    submitMessage = '';
    requestId = '';
    try {
      let updatedInvoice: DirectInvoiceRecord | null = null;
      if (['issue', 'remind', 'void'].includes(submittedOperation)) {
        updatedInvoice = await backendClient.directInvoiceAction(
          submittedTenantId,
          submittedRecordId,
          submittedOperation as 'issue' | 'remind' | 'void',
          submittedOperationKey,
          submittedAuditReason,
        );
      } else if (submittedOperation === 'manual_payment') {
        updatedInvoice = await backendClient.recordManualPayment({
          tenantId: submittedTenantId,
          invoiceId: submittedRecordId,
          amountCents: submittedAmountCents!,
          method: submittedPaymentMethod,
          reference: submittedPaymentReference,
          note: submittedAuditReason,
          auditReason: submittedAuditReason,
          receivedAt: submittedReceivedAt,
          idempotencyKey: submittedOperationKey,
        });
      } else if (submittedOperation === 'invoice_refund') {
        updatedInvoice = await backendClient.refundDirectInvoice({
          tenantId: submittedTenantId,
          invoiceId: submittedRecordId,
          amountCents: submittedAmountCents!,
          reason: submittedProviderReason,
          note: submittedAuditReason,
          idempotencyKey: submittedOperationKey,
        });
      } else {
        await backendClient.refundTransaction({
          tenantId: submittedTenantId,
          transactionId: submittedRecordId,
          amountCents: submittedAmountCents!,
          reason: submittedProviderReason,
          note: submittedAuditReason,
          idempotencyKey: submittedOperationKey,
        });
      }

      if (
        generation !== commandGeneration
        || !open
        || panelIdentity !== submittedPanelIdentity
      ) return;
      if (updatedInvoice) workingInvoice = updatedInvoice;
      submitState = 'success';
      submitMessage =
        submittedOperation === 'remind'
          ? 'Reminder sent and audited.'
          : 'The operation was accepted by the authoritative backend.';
      dispatch('changed', {
        invoice: updatedInvoice,
        kind: submittedKind,
        id: submittedRecordId,
      });
      if (updatedInvoice) await loadLedger();
    } catch (error) {
      if (
        generation !== commandGeneration
        || !open
        || panelIdentity !== submittedPanelIdentity
      ) return;
      submitState = 'error';
      submitMessage = errorMessage(
        error,
        'The financial operation could not be completed. Retry or contact support if the problem continues.',
      );
    }
  }

  function addDraftLine() {
    if (submitState === 'loading' || draftLines.length >= 100) return;
    draftLines = [...draftLines, newDraftLine()];
  }

  function removeDraftLine(key: string) {
    if (submitState === 'loading' || draftLines.length === 1) return;
    draftLines = draftLines.filter((line) => line.key !== key);
  }

  function calculateDraftPreview(
    lines: DraftLine[],
    discountInput: string,
    taxPercentInput: string,
  ) {
    let subtotalCents = 0;
    let valid = lines.length > 0;
    for (const line of lines) {
      const amount = parseMajorUnitInput(line.unitAmount);
      if (
        !line.description.trim()
        || !Number.isSafeInteger(line.quantity)
        || line.quantity < 1
        || line.quantity > 1000
        || amount === null
        || amount < 0
        || amount > 50_000_000
      ) {
        valid = false;
        continue;
      }
      subtotalCents += amount * line.quantity;
    }
    const discountCents = parseMajorUnitInput(discountInput);
    const taxRateBps = parsePercentToBasisPoints(taxPercentInput);
    if (
      discountCents === null
      || taxRateBps === null
      || discountCents > subtotalCents
    ) {
      valid = false;
    }
    const taxableCents = subtotalCents - (discountCents ?? 0);
    const taxCents = Math.round(
      (taxableCents * (taxRateBps ?? 0)) / 10_000,
    );
    const totalCents = taxableCents + taxCents;
    if (totalCents < 50) valid = false;
    return {
      valid,
      subtotalCents,
      discountCents,
      taxRateBps,
      taxCents,
      totalCents,
    };
  }

  function draftValidation(): string {
    if (!ownerAuthorized) return 'Only an organization owner can create invoices.';
    if (!tenantId) return 'Choose an organization before continuing.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftRecipientEmail.trim())) {
      return 'Enter a valid recipient email.';
    }
    if (!draftTitle.trim() || draftTitle.trim().length > 160) {
      return 'Enter an invoice title of 160 characters or fewer.';
    }
    if (
      !Number.isSafeInteger(draftDueDays)
      || draftDueDays < 1
      || draftDueDays > 90
    ) {
      return 'Due days must be an integer from 1 to 90.';
    }
    if (!draftPreview.valid) {
      return 'Review line descriptions, quantities, amounts, discount, tax, and the 50-cent minimum total.';
    }
    if (!impactConfirmed) return 'Confirm that you reviewed the draft impact.';
    return '';
  }

  async function submitDraft() {
    if (submitState === 'loading' || submitState === 'success') return;
    const validation = draftValidation();
    if (validation || !tenantId) {
      submitState = 'error';
      submitMessage = validation || 'The draft is incomplete.';
      return;
    }
    const draftPayload = {
      tenantId,
      recipientEmail: draftRecipientEmail.trim().toLowerCase(),
      recipientName: draftRecipientName.trim() || undefined,
      title: draftTitle.trim(),
      memo: draftMemo.trim() || undefined,
      dueDays: draftDueDays,
      discountCents: draftPreview.discountCents ?? 0,
      taxRateBps: draftPreview.taxRateBps ?? 0,
      lineItems: draftLines.map((line) => ({
        description: line.description.trim(),
        quantity: line.quantity,
        unitAmountCents: parseMajorUnitInput(line.unitAmount)!,
      })),
    };
    const payloadSignature = JSON.stringify(draftPayload);
    if (payloadSignature !== draftKeySignature) {
      draftKeySignature = payloadSignature;
      operationKey = createIdempotencyKey('create-direct-invoice');
    }
    const submittedOperationKey = operationKey;
    const submittedPanelIdentity = panelIdentity;
    const generation = ++commandGeneration;
    submitState = 'loading';
    submitMessage = '';
    requestId = '';
    try {
      const invoice = await backendClient.createDirectInvoice(
        draftPayload,
        submittedOperationKey,
      );
      if (
        generation !== commandGeneration
        || !open
        || panelIdentity !== submittedPanelIdentity
      ) return;
      submitState = 'success';
      submitMessage =
        'Draft created. It has not been issued or sent to the recipient.';
      dispatch('created', { invoice });
    } catch (error) {
      if (
        generation !== commandGeneration
        || !open
        || panelIdentity !== submittedPanelIdentity
      ) return;
      submitState = 'error';
      submitMessage = errorMessage(
        error,
        'The invoice draft could not be created. Retry or contact support if the problem continues.',
      );
    }
  }
</script>

{#if open}
  <button
    type="button"
    class="fixed inset-0 z-[90] h-full w-full bg-gray-900/50 backdrop-blur-sm"
    on:click={close}
    aria-label="Close financial details"
    tabindex="-1"
  ></button>

  <div
    class="fixed inset-y-0 right-0 z-[100] flex w-full max-w-2xl flex-col bg-white shadow-2xl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="finance-detail-title"
    tabindex="-1"
    use:modalFocus={{ onEscape: close }}
  >
    <header class="flex items-start justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-[var(--crm-brand-link)]">
          {createMode ? 'Financial operation' : humanizeStatus(row?.kind)}
        </p>
        <h2 id="finance-detail-title" class="mt-1 text-lg font-semibold text-gray-950">
          {createMode
            ? 'Create invoice draft'
            : row?.recordLabel || 'Financial record'}
        </h2>
        {#if !createMode && row}
          <p class="mt-1 text-sm text-gray-600">
            {row.partyLabel} · {row.contextLabel}
          </p>
        {/if}
      </div>
      <button
        type="button"
        class="rounded-md p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--crm-brand-focus)]"
        aria-label="Close financial details"
        disabled={submitState === 'loading'}
        on:click={close}
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-5">
      {#if createMode}
        <form class="space-y-5" on:submit|preventDefault={submitDraft}>
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            This creates an editable draft only. It does not charge a family or send an email. Issue the draft separately after review.
          </div>
          <fieldset
            disabled={submitState === 'loading'}
            class="min-w-0 space-y-5 border-0 p-0"
          >

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="invoice-recipient-name" class="crm-ui-label-strong">Recipient name</label>
              <input id="invoice-recipient-name" bind:value={draftRecipientName} maxlength="160" class="crm-ui-input" autocomplete="name" />
            </div>
            <div>
              <label for="invoice-recipient-email" class="crm-ui-label-strong">Recipient email</label>
              <input id="invoice-recipient-email" type="email" bind:value={draftRecipientEmail} required class="crm-ui-input" autocomplete="email" />
            </div>
          </div>

          <div>
            <label for="invoice-title" class="crm-ui-label-strong">Invoice title</label>
            <input id="invoice-title" bind:value={draftTitle} maxlength="160" required class="crm-ui-input" />
          </div>

          <div>
            <label for="invoice-memo" class="crm-ui-label-strong">Recipient memo</label>
            <textarea id="invoice-memo" bind:value={draftMemo} maxlength="2000" rows="3" class="crm-ui-input"></textarea>
            <p class="crm-ui-hint">This message is visible to the recipient when the invoice is issued.</p>
          </div>

          <fieldset class="space-y-3">
            <legend class="text-sm font-semibold text-gray-900">Line items</legend>
            {#each draftLines as line, index (line.key)}
              <div class="grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_100px_140px_auto]">
                <div>
                  <label for={`line-description-${line.key}`} class="crm-ui-label-xs">Description</label>
                  <input id={`line-description-${line.key}`} bind:value={line.description} maxlength="240" required class="crm-ui-line-input" />
                </div>
                <div>
                  <label for={`line-quantity-${line.key}`} class="crm-ui-label-xs">Quantity</label>
                  <input id={`line-quantity-${line.key}`} type="number" min="1" max="1000" step="1" bind:value={line.quantity} required class="crm-ui-line-input" />
                </div>
                <div>
                  <label for={`line-amount-${line.key}`} class="crm-ui-label-xs">Unit amount (USD)</label>
                  <input id={`line-amount-${line.key}`} inputmode="decimal" bind:value={line.unitAmount} placeholder="0.00" required class="crm-ui-line-input" />
                </div>
                <button
                  type="button"
                  class="crm-ui-button-secondary self-end px-2 text-gray-700"
                  disabled={draftLines.length === 1}
                  aria-label={`Remove line item ${index + 1}`}
                  on:click={() => removeDraftLine(line.key)}
                >
                  Remove
                </button>
              </div>
            {/each}
            <button
              type="button"
              class="crm-ui-button-secondary bg-white text-gray-800"
              disabled={draftLines.length >= 100}
              on:click={addDraftLine}
            >
              Add line item
            </button>
          </fieldset>

          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label for="invoice-due-days" class="crm-ui-label-strong">Due in days</label>
              <input id="invoice-due-days" type="number" min="1" max="90" step="1" bind:value={draftDueDays} required class="crm-ui-input" />
            </div>
            <div>
              <label for="invoice-discount" class="crm-ui-label-strong">Discount (USD)</label>
              <input id="invoice-discount" inputmode="decimal" bind:value={draftDiscount} class="crm-ui-input" />
            </div>
            <div>
              <label for="invoice-tax" class="crm-ui-label-strong">Tax percent</label>
              <input id="invoice-tax" inputmode="decimal" bind:value={draftTaxPercent} class="crm-ui-input" />
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-4">
            <div><dt class="text-gray-500">Subtotal</dt><dd class="mt-1 font-semibold">{formatMinorUnits(draftPreview.subtotalCents, 'USD')}</dd></div>
            <div><dt class="text-gray-500">Discount</dt><dd class="mt-1 font-semibold">{formatMinorUnits(draftPreview.discountCents, 'USD')}</dd></div>
            <div><dt class="text-gray-500">Tax</dt><dd class="mt-1 font-semibold">{formatMinorUnits(draftPreview.taxCents, 'USD')}</dd></div>
            <div><dt class="text-gray-500">Draft total</dt><dd class="mt-1 font-semibold">{formatMinorUnits(draftPreview.totalCents, 'USD')}</dd></div>
          </dl>

          <label class="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-800">
            <input type="checkbox" bind:checked={impactConfirmed} class="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--crm-brand-link)]" />
            <span>I reviewed the recipient, line items, integer-minor-unit totals, and understand this creates an unsent draft.</span>
          </label>

          {#if submitMessage}
            <div class="crm-ui-operation-message {submitState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={submitState === 'error' ? 'alert' : 'status'}>
              {submitMessage}
            </div>
          {/if}

          <div class="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button type="button" class="crm-ui-button-secondary px-4" disabled={submitState === 'loading'} on:click={close}>Cancel</button>
            <button type="submit" class="crm-ui-button-primary" disabled={submitState === 'loading' || submitState === 'success'}>
              {submitState === 'loading' ? 'Creating draft…' : submitState === 'success' ? 'Draft created' : 'Create draft'}
            </button>
          </div>
          </fieldset>
        </form>
      {:else if row}
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-gray-200 p-3">
            <p class="crm-ui-eyebrow">Status</p>
            <p class="mt-1 font-semibold text-gray-950">{humanizeStatus(directInvoice?.status || row.status)}</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-3">
            <p class="crm-ui-eyebrow">{row.primaryLabel}</p>
            <p class="mt-1 font-semibold text-gray-950">{formatMinorUnits(row.primaryCents, row.currency)}</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-3">
            <p class="crm-ui-eyebrow">{row.secondaryLabel}</p>
            <p class="mt-1 font-semibold text-gray-950">{formatMinorUnits(row.secondaryCents, row.currency)}</p>
          </div>
        </div>

        {#if directInvoice}
          <div class="mt-5 space-y-5">
            <dl class="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
              <div class="crm-ui-detail-row"><dt class="text-gray-500">Recipient</dt><dd class="crm-ui-detail-value">{directInvoice.recipientName || 'Name unavailable'}<span class="block text-gray-600">{directInvoice.recipientEmail || 'Email unavailable'}</span></dd></div>
              <div class="crm-ui-detail-row"><dt class="text-gray-500">Created</dt><dd class="crm-ui-detail-value">{dateLabel(directInvoice.createdAt)}</dd></div>
              <div class="crm-ui-detail-row"><dt class="text-gray-500">Due</dt><dd class="crm-ui-detail-value">{dateLabel(directInvoice.dueAt)} · {humanizeStatus(directInvoice.agingBucket)}</dd></div>
              <div class="crm-ui-detail-row"><dt class="text-gray-500">Activity</dt><dd class="crm-ui-detail-value">{directInvoice.reminderCount} reminders · {directInvoice.manualPaymentCount} manual payments · {directInvoice.refundCount} refunds</dd></div>
            </dl>

            <section aria-labelledby="invoice-lines-heading">
              <h3 id="invoice-lines-heading" class="text-sm font-semibold text-gray-950">Invoice lines</h3>
              <div class="mt-2 overflow-hidden rounded-lg border border-gray-200">
                {#each directInvoice.lineItems as line (line.id || line.description)}
                  <div class="flex items-start justify-between gap-4 border-b border-gray-100 px-3 py-2 text-sm last:border-0">
                    <div><p class="font-medium text-gray-900">{line.description}</p><p class="text-gray-500">Quantity {line.quantity} × {formatMinorUnits(line.unitAmountCents, directInvoice.currency)}</p></div>
                    <p class="font-semibold text-gray-900">{formatMinorUnits(line.amountCents ?? line.quantity * line.unitAmountCents, directInvoice.currency)}</p>
                  </div>
                {/each}
                <dl class="border-t border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <div class="flex justify-between"><dt>Subtotal</dt><dd>{formatMinorUnits(directInvoice.subtotalCents, directInvoice.currency)}</dd></div>
                  <div class="mt-1 flex justify-between"><dt>Discount</dt><dd>-{formatMinorUnits(directInvoice.discountCents, directInvoice.currency)}</dd></div>
                  <div class="mt-1 flex justify-between"><dt>Tax</dt><dd>{formatMinorUnits(directInvoice.taxCents, directInvoice.currency)}</dd></div>
                  <div class="mt-2 flex justify-between border-t border-gray-200 pt-2 font-semibold"><dt>Total</dt><dd>{formatMinorUnits(directInvoice.totalCents, directInvoice.currency)}</dd></div>
                </dl>
              </div>
            </section>

            {#if safeHostedInvoiceUrl || safeInvoicePdfUrl}
              <div class="flex flex-wrap gap-3">
                {#if safeHostedInvoiceUrl}<a href={safeHostedInvoiceUrl} target="_blank" rel="noopener noreferrer" class="crm-theme-link text-sm font-semibold hover:underline">Open hosted invoice</a>{/if}
                {#if safeInvoicePdfUrl}<a href={safeInvoicePdfUrl} target="_blank" rel="noopener noreferrer" class="crm-theme-link text-sm font-semibold hover:underline">Open invoice PDF</a>{/if}
              </div>
            {/if}
            {#if directInvoice.hostedInvoiceUrl && !safeHostedInvoiceUrl}
              <p class="text-xs text-amber-700">Hosted invoice link unavailable because the server value is not a safe HTTPS URL.</p>
            {/if}
            {#if directInvoice.invoicePdfUrl && !safeInvoicePdfUrl}
              <p class="text-xs text-amber-700">Invoice PDF unavailable because the server value is not a safe HTTPS URL.</p>
            {/if}

            <section aria-labelledby="invoice-ledger-heading">
              <div class="crm-ui-between">
                <h3 id="invoice-ledger-heading" class="text-sm font-semibold text-gray-950">Ledger timeline</h3>
                <button type="button" on:click={loadLedger} disabled={ledgerState === 'loading'} class="crm-ui-button-secondary px-2 py-1 text-xs">{ledgerState === 'loading' ? 'Refreshing…' : 'Refresh ledger'}</button>
              </div>
              {#if ledgerState === 'loading'}
                <p class="mt-2 text-sm text-gray-500" role="status">Loading the authoritative invoice ledger…</p>
              {:else if ledgerState === 'error'}
                <div class="crm-ui-danger mt-2" role="alert">{ledgerError}</div>
              {:else if ledger && ledger.events.length + ledger.payments.length + ledger.refunds.length > 0}
                {#if ledger.providerAccounting}
                  <dl class="mt-2 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm sm:grid-cols-2" aria-label="Stripe-authoritative accounting">
                    <div><dt class="text-gray-500">Charge gross</dt><dd class="font-semibold">{formatMinorUnits(ledger.providerAccounting.chargeGrossCents, ledger.providerAccounting.currency)}</dd></div>
                    <div><dt class="text-gray-500">Processor fees</dt><dd class="font-semibold">{formatMinorUnits(ledger.providerAccounting.chargeFeeCents, ledger.providerAccounting.currency)}</dd></div>
                    <div><dt class="text-gray-500">Charge net</dt><dd class="font-semibold">{formatMinorUnits(ledger.providerAccounting.chargeNetCents, ledger.providerAccounting.currency)}</dd></div>
                    <div><dt class="text-gray-500">Refund gross</dt><dd class="font-semibold">{formatMinorUnits(ledger.providerAccounting.refundGrossCents, ledger.providerAccounting.currency)}</dd></div>
                    <div><dt class="text-gray-500">Refund fee adjustment</dt><dd class="font-semibold">{formatMinorUnits(ledger.providerAccounting.refundFeeCents, ledger.providerAccounting.currency)}</dd></div>
                    <div><dt class="text-gray-500">Settled net</dt><dd class="font-semibold">{formatMinorUnits(ledger.providerAccounting.settledNetCents, ledger.providerAccounting.currency)}</dd></div>
                  </dl>
                {/if}
                {#if ledger.truncated.events || ledger.truncated.payments || ledger.truncated.refunds}
                  <p class="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                    This ledger is incomplete. Limits: {ledger.limits.events} events, {ledger.limits.payments} payments, and {ledger.limits.refunds} refunds.
                  </p>
                {/if}
                <ul class="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {#each [...ledger.events, ...ledger.payments, ...ledger.refunds].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || ''))) as entry (String(entry.id))}
                    <li class="p-3 text-sm">
                      <div class="flex items-start justify-between gap-3">
                        <p class="font-medium text-gray-900">{humanizeStatus(entry.type || entry.source || 'ledger event')}</p>
                        <time class="crm-ui-hint-xs">{dateLabel(entry.createdAt || entry.receivedAt)}</time>
                      </div>
                      <p class="mt-1 text-gray-600">{humanizeStatus(entry.status)}{#if safeMinorUnits(entry.amountCents) !== null} · {formatMinorUnits(entry.amountCents, entry.currency || directInvoice.currency)}{/if}</p>
                      {#if safeMinorUnits(entry.grossCents) !== null && safeMinorUnits(entry.feeCents) !== null && safeMinorUnits(entry.netCents) !== null}
                        <p class="mt-1 text-xs text-gray-500">Gross {formatMinorUnits(entry.grossCents, entry.currency || directInvoice.currency)} · Fee {formatMinorUnits(entry.feeCents, entry.currency || directInvoice.currency)} · Net {formatMinorUnits(entry.netCents, entry.currency || directInvoice.currency)}</p>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="mt-2 rounded-md border border-gray-200 p-3 text-sm text-gray-500">No ledger entries are available for this invoice.</p>
              {/if}
            </section>

            {#if !operation}
              <section aria-labelledby="invoice-actions-heading">
                <h3 id="invoice-actions-heading" class="text-sm font-semibold text-gray-950">Invoice actions</h3>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={!ownerAuthorized || !invoiceCapabilities?.issue.enabled} title={invoiceCapabilities?.issue.reason || undefined} on:click={() => beginOperation('issue')} class="crm-ui-button-secondary">Issue invoice</button>
                  <button type="button" disabled={!ownerAuthorized || !invoiceCapabilities?.remind.enabled} title={invoiceCapabilities?.remind.reason || undefined} on:click={() => beginOperation('remind')} class="crm-ui-button-secondary">Send reminder</button>
                  <button type="button" disabled={!ownerAuthorized || !invoiceCapabilities?.manualPayment.enabled} title={invoiceCapabilities?.manualPayment.reason || undefined} on:click={() => beginOperation('manual_payment')} class="crm-ui-button-secondary">Record offline payment</button>
                  <button type="button" disabled={!ownerAuthorized || !invoiceCapabilities?.refund.enabled} title={invoiceCapabilities?.refund.reason || undefined} on:click={() => beginOperation('invoice_refund')} class="crm-ui-button-secondary">Refund invoice payment</button>
                  <button type="button" disabled={!ownerAuthorized || !invoiceCapabilities?.void.enabled} title={invoiceCapabilities?.void.reason || undefined} on:click={() => beginOperation('void')} class="crm-ui-button-danger-outline">Void invoice</button>
                </div>
                {#if !ownerAuthorized}<p class="mt-2 text-xs text-gray-500">Financial actions require organization-owner access.</p>{/if}
              </section>
            {/if}
          </div>
        {:else if row.kind === 'deposit'}
          <dl class="mt-5 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
            <div class="crm-ui-detail-row"><dt class="text-gray-500">Gateway</dt><dd class="crm-ui-detail-value">{String((row.original as FinanceRecord).gateway || 'Unavailable')}</dd></div>
            <div class="crm-ui-detail-row"><dt class="text-gray-500">Reconciliation</dt><dd class="crm-ui-detail-value">{humanizeStatus((row.original as FinanceRecord).reconciliationStatus)}</dd></div>
            <div class="crm-ui-detail-row"><dt class="text-gray-500">Transactions</dt><dd class="crm-ui-detail-value">{Array.isArray((row.original as FinanceRecord).transactionIds) ? ((row.original as FinanceRecord).transactionIds as unknown[]).length : 'Unavailable'}</dd></div>
          </dl>
          <div class="mt-5 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            Payout status is processor-owned and read-only. HuddleWay never marks a bank deposit paid from the browser.
          </div>
        {:else}
          <dl class="mt-5 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
            <div class="crm-ui-detail-row"><dt class="text-gray-500">Record ID</dt><dd class="col-span-2 break-all text-gray-900">{row.recordId || row.id}</dd></div>
            <div class="crm-ui-detail-row"><dt class="text-gray-500">Date</dt><dd class="crm-ui-detail-value">{row.dateLabel}</dd></div>
            {#if row.kind === 'dispute'}
              <div class="crm-ui-detail-row"><dt class="text-gray-500">Dispute state</dt><dd class="crm-ui-detail-value">{humanizeStatus((row.original as FinanceRecord).disputeStatus)}</dd></div>
            {/if}
          </dl>
          {#if (row.kind === 'transaction' || row.kind === 'dispute') && (coreRefundable ?? 0) > 0 && !operation}
            <button type="button" disabled={!ownerAuthorized} on:click={() => beginOperation('core_refund')} class="crm-ui-button-danger-outline mt-5">Refund transaction</button>
          {/if}
        {/if}

        {#if operation}
          <form class="mt-6 space-y-4 rounded-lg border border-gray-300 bg-gray-50 p-4" on:submit|preventDefault={submitOperation}>
            <div class="flex items-start justify-between gap-4">
              <div><p class="text-sm font-semibold text-gray-950">{humanizeStatus(operation)}</p><p class="mt-1 text-sm text-gray-700">{operationImpact()}</p></div>
              <button type="button" class="text-sm font-medium text-gray-600 hover:text-gray-950" disabled={submitState === 'loading'} on:click={cancelOperation}>Cancel</button>
            </div>
            <fieldset
              disabled={submitState === 'loading'}
              class="min-w-0 space-y-4 border-0 p-0"
            >

            {#if ['manual_payment', 'invoice_refund', 'core_refund'].includes(operation)}
              <div>
                <label for="financial-operation-amount" class="crm-ui-label-strong">Amount ({safeCurrency(row.currency) || 'currency unavailable'})</label>
                <input id="financial-operation-amount" inputmode="decimal" bind:value={amountInput} required class="crm-ui-input" aria-describedby="financial-operation-amount-help" />
                <p id="financial-operation-amount-help" class="crm-ui-hint">
                  {operation === 'manual_payment'
                    ? `Maximum authoritative balance: ${formatMinorUnits(directInvoice?.amountDueCents, directInvoice?.currency)}${directInvoice?.stripeInvoiceId ? '; Stripe-hosted invoices require the full balance.' : ''}`
                    : `Maximum refundable amount: ${formatMinorUnits(operation === 'invoice_refund' ? invoiceCapabilities?.refundableCents : coreRefundable, row.currency)}`}
                </p>
              </div>
            {/if}

            {#if operation === 'manual_payment'}
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="manual-payment-method" class="crm-ui-label-strong">Tender method</label>
                  <select id="manual-payment-method" bind:value={paymentMethod} class="crm-ui-input">
                    <option value="cash">Cash</option><option value="check">Check</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label for="manual-payment-received" class="crm-ui-label-strong">Received at</label>
                  <input id="manual-payment-received" type="datetime-local" bind:value={receivedAt} required class="crm-ui-input" />
                </div>
              </div>
              <div>
                <label for="manual-payment-reference" class="crm-ui-label-strong">Receipt or reference</label>
                <input id="manual-payment-reference" bind:value={paymentReference} maxlength="160" required class="crm-ui-input" />
              </div>
            {/if}

            {#if operation === 'invoice_refund' || operation === 'core_refund'}
              <div>
                <label for="refund-provider-reason" class="crm-ui-label-strong">Processor reason</label>
                <select id="refund-provider-reason" bind:value={providerReason} class="crm-ui-input">
                  <option value="requested_by_customer">Requested by customer</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="fraudulent">Fraudulent</option>
                </select>
                {#if row.kind === 'dispute'}<p class="mt-1 text-xs text-amber-800">Refunding does not close or concede the separate processor dispute.</p>{/if}
              </div>
            {/if}

            <div>
              <label for="financial-audit-reason" class="crm-ui-label-strong">Internal audit reason</label>
              <textarea id="financial-audit-reason" bind:value={auditReason} minlength="3" maxlength="500" required rows="3" class="crm-ui-input" aria-describedby="financial-audit-help"></textarea>
              <p id="financial-audit-help" class="crm-ui-hint">Required for the append-only audit record. Do not enter card or bank details.</p>
            </div>

            <label class="flex items-start gap-3 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800">
              <input type="checkbox" bind:checked={impactConfirmed} class="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--crm-brand-link)]" />
              <span>I reviewed the amount, scope, status transition, and downstream impact described above.</span>
            </label>

            {#if submitMessage}
              <div class="crm-ui-operation-message {submitState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={submitState === 'error' ? 'alert' : 'status'}>
                {submitMessage}
              </div>
            {/if}

            <button type="submit" disabled={submitState === 'loading' || submitState === 'success'} class="crm-ui-button-primary w-full">
              {submitState === 'loading' ? 'Submitting once…' : submitState === 'success' ? 'Operation accepted' : 'Confirm operation'}
            </button>
            </fieldset>
          </form>
        {/if}
      {/if}
    </div>
  </div>
{/if}
