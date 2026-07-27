<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    BackendApiError,
    createIdempotencyKey,
    type FinancialPeriodInput,
    type FinancialPeriodPreview,
    type FinancialPeriodRecord,
  } from '../../lib/api/BackendApi';
  import { backendClient } from '../../lib/api/backendClient';
  import { humanizeStatus } from '../../lib/finance/crmFinancials';

  export let tenantId = '';

  type AsyncState = 'idle' | 'loading' | 'ready' | 'error';

  const dispatch = createEventDispatcher<{ changed: { periodId: string } }>();
  const closeConfirmationText = 'CLOSE FINANCIAL PERIOD';
  const reopenConfirmationText = 'REOPEN FINANCIAL PERIOD';

  let loadedTenantId = '';
  let listSequence = 0;
  let listState: AsyncState = 'idle';
  let listError = '';
  let listRequestId = '';
  let periods: FinancialPeriodRecord[] = [];
  let periodsTruncated = false;

  let label = '';
  let startDate = '';
  let endDate = '';
  let closeReason = '';
  let closeConfirmation = '';
  let preview: FinancialPeriodPreview | null = null;
  let previewState: AsyncState = 'idle';
  let previewError = '';
  let previewRequestId = '';
  let previewSignature = '';
  let closeState: AsyncState = 'idle';
  let closeError = '';
  let closeRequestId = '';
  let closeSuccess = '';
  let closeOperationKey = createIdempotencyKey('financial-period-close');
  let closeKeySignature = '';

  let reopenPeriodId = '';
  let reopenReason = '';
  let reopenConfirmation = '';
  let reopenState: AsyncState = 'idle';
  let reopenError = '';
  let reopenRequestId = '';
  let reopenSuccess = '';
  let reopenOperationKey = createIdempotencyKey('financial-period-reopen');
  let reopenKeySignature = '';

  $: periodInput = {
    label: label.trim(),
    startDate,
    endDate,
  } satisfies FinancialPeriodInput;
  $: currentPeriodSignature = JSON.stringify(periodInput);
  $: periodValidationError = validatePeriod(periodInput);
  $: previewMatchesInput =
    previewState === 'ready'
    && Boolean(preview)
    && previewSignature === currentPeriodSignature;
  $: closeSignature = JSON.stringify({
    tenantId,
    period: periodInput,
    auditReason: closeReason.trim(),
  });
  $: if (
    closeSignature !== closeKeySignature
    && closeState !== 'loading'
  ) {
    closeKeySignature = closeSignature;
    closeOperationKey = createIdempotencyKey('financial-period-close');
    closeState = closeState === 'error' ? 'idle' : closeState;
    closeError = '';
    closeRequestId = '';
    closeSuccess = '';
  }
  $: reopenSignature = JSON.stringify({
    tenantId,
    periodId: reopenPeriodId,
    auditReason: reopenReason.trim(),
  });
  $: if (
    reopenSignature !== reopenKeySignature
    && reopenState !== 'loading'
  ) {
    reopenKeySignature = reopenSignature;
    reopenOperationKey = createIdempotencyKey('financial-period-reopen');
    reopenState = reopenState === 'error' ? 'idle' : reopenState;
    reopenError = '';
    reopenRequestId = '';
    reopenSuccess = '';
  }
  $: if (tenantId && tenantId !== loadedTenantId) {
    loadedTenantId = tenantId;
    resetTenantState();
    void loadPeriods();
  }
  $: if (!tenantId && loadedTenantId) {
    loadedTenantId = '';
    resetTenantState();
  }

  function validateDateKey(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime())
      || date.toISOString().slice(0, 10) !== value
    ) {
      return null;
    }
    return date;
  }

  function validatePeriod(period: FinancialPeriodInput) {
    if (!period.label || period.label.length > 120) {
      return 'Enter a period label of 120 characters or fewer.';
    }
    const start = validateDateKey(period.startDate);
    const end = validateDateKey(period.endDate);
    if (!start || !end) {
      return 'Choose valid start and end dates.';
    }
    const durationDays = Math.round(
      (end.getTime() - start.getTime()) / 86_400_000,
    );
    if (durationDays < 1 || durationDays > 366) {
      return 'The end date must be 1–366 days after the start date.';
    }
    return '';
  }

  function resetTenantState() {
    listSequence += 1;
    listState = tenantId ? 'loading' : 'idle';
    listError = '';
    listRequestId = '';
    periods = [];
    periodsTruncated = false;
    clearCloseForm();
    cancelReopen();
  }

  function clearCloseForm() {
    label = '';
    startDate = '';
    endDate = '';
    closeReason = '';
    closeConfirmation = '';
    preview = null;
    previewState = 'idle';
    previewError = '';
    previewRequestId = '';
    previewSignature = '';
    closeState = 'idle';
    closeError = '';
    closeRequestId = '';
    closeSuccess = '';
  }

  function errorDetails(error: unknown, fallback: string) {
    if (error instanceof BackendApiError) {
      return {
        message: error.message || fallback,
        requestId: error.requestId || '',
      };
    }
    return {
      message: fallback,
      requestId: '',
    };
  }

  async function loadPeriods() {
    const requestedTenantId = tenantId;
    if (!requestedTenantId) return;
    const sequence = ++listSequence;
    listState = 'loading';
    listError = '';
    listRequestId = '';
    try {
      const result = await backendClient.financialPeriods(
        requestedTenantId,
        100,
      );
      if (
        sequence !== listSequence
        || tenantId !== requestedTenantId
      ) {
        return;
      }
      if (result.tenantId !== requestedTenantId) {
        throw new Error(
          'The financial-period response did not match the active organization.',
        );
      }
      periods = result.periods;
      periodsTruncated = result.truncated;
      listState = 'ready';
    } catch (error) {
      if (
        sequence !== listSequence
        || tenantId !== requestedTenantId
      ) {
        return;
      }
      const details = errorDetails(
        error,
        'Financial periods could not be loaded.',
      );
      listState = 'error';
      listError = details.message;
      listRequestId = details.requestId;
    }
  }

  async function previewPeriod() {
    const requestedTenantId = tenantId;
    const requestedSignature = currentPeriodSignature;
    if (!requestedTenantId || periodValidationError) return;
    previewState = 'loading';
    previewError = '';
    previewRequestId = '';
    preview = null;
    closeState = 'idle';
    closeError = '';
    closeSuccess = '';
    try {
      const result = await backendClient.previewFinancialPeriod(
        requestedTenantId,
        periodInput,
      );
      if (
        tenantId !== requestedTenantId
        || currentPeriodSignature !== requestedSignature
      ) {
        return;
      }
      if (result.tenantId !== requestedTenantId) {
        throw new Error(
          'The preview response did not match the active organization.',
        );
      }
      preview = result.preview;
      previewSignature = requestedSignature;
      previewState = 'ready';
    } catch (error) {
      if (
        tenantId !== requestedTenantId
        || currentPeriodSignature !== requestedSignature
      ) {
        return;
      }
      const details = errorDetails(
        error,
        'The financial-period preview failed.',
      );
      previewState = 'error';
      previewError = details.message;
      previewRequestId = details.requestId;
    }
  }

  async function closePeriod() {
    const requestedTenantId = tenantId;
    const requestedSignature = currentPeriodSignature;
    if (
      !requestedTenantId
      || periodValidationError
      || !previewMatchesInput
      || preview?.truncated
      || closeReason.trim().length < 3
      || closeReason.trim().length > 500
      || closeConfirmation !== closeConfirmationText
      || closeState === 'loading'
    ) {
      return;
    }
    closeState = 'loading';
    closeError = '';
    closeRequestId = '';
    closeSuccess = '';
    try {
      const result = await backendClient.closeFinancialPeriod(
        requestedTenantId,
        periodInput,
        closeReason.trim(),
        closeOperationKey,
      );
      if (
        tenantId !== requestedTenantId
        || currentPeriodSignature !== requestedSignature
      ) {
        return;
      }
      closeState = 'ready';
      closeSuccess = result.idempotentReplay
        ? 'This close request was already completed. The period list has been refreshed.'
        : 'Financial period closed. Administrative financial changes in this half-open date range are now blocked.';
      closeConfirmation = '';
      await loadPeriods();
      dispatch('changed', { periodId: result.periodId });
    } catch (error) {
      if (
        tenantId !== requestedTenantId
        || currentPeriodSignature !== requestedSignature
      ) {
        return;
      }
      const details = errorDetails(
        error,
        'The financial period could not be closed.',
      );
      closeState = 'error';
      closeError = details.message;
      closeRequestId = details.requestId;
    }
  }

  function beginReopen(periodId: string) {
    reopenPeriodId = periodId;
    reopenReason = '';
    reopenConfirmation = '';
    reopenState = 'idle';
    reopenError = '';
    reopenRequestId = '';
    reopenSuccess = '';
  }

  function cancelReopen() {
    reopenPeriodId = '';
    reopenReason = '';
    reopenConfirmation = '';
    reopenState = 'idle';
    reopenError = '';
    reopenRequestId = '';
    reopenSuccess = '';
  }

  async function reopenPeriod() {
    const requestedTenantId = tenantId;
    const requestedPeriodId = reopenPeriodId;
    if (
      !requestedTenantId
      || !requestedPeriodId
      || reopenReason.trim().length < 3
      || reopenReason.trim().length > 500
      || reopenConfirmation !== reopenConfirmationText
      || reopenState === 'loading'
    ) {
      return;
    }
    reopenState = 'loading';
    reopenError = '';
    reopenRequestId = '';
    reopenSuccess = '';
    try {
      const result = await backendClient.reopenFinancialPeriod(
        requestedTenantId,
        requestedPeriodId,
        reopenReason.trim(),
        reopenOperationKey,
      );
      if (
        tenantId !== requestedTenantId
        || reopenPeriodId !== requestedPeriodId
      ) {
        return;
      }
      reopenState = 'ready';
      reopenSuccess = result.idempotentReplay
        ? 'This reopen request was already completed. The period list has been refreshed.'
        : 'Financial period reopened. Administrative changes are allowed again unless another closed period covers the date.';
      reopenConfirmation = '';
      await loadPeriods();
      dispatch('changed', { periodId: result.periodId });
    } catch (error) {
      if (
        tenantId !== requestedTenantId
        || reopenPeriodId !== requestedPeriodId
      ) {
        return;
      }
      const details = errorDetails(
        error,
        'The financial period could not be reopened.',
      );
      reopenState = 'error';
      reopenError = details.message;
      reopenRequestId = details.requestId;
    }
  }

  function periodDateLabel(value: string) {
    const date = validateDateKey(value);
    return date
      ? new Intl.DateTimeFormat(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(date)
      : value || 'Date unavailable';
  }
</script>

<section
  class="mt-6 rounded-xl border border-gray-200 bg-white p-5"
  aria-labelledby="financial-period-heading"
>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h3 id="financial-period-heading" class="font-semibold text-gray-950">
        Financial period controls
      </h3>
      <p class="mt-1 max-w-3xl text-sm text-gray-700">
        Closing a period blocks administrative financial mutations whose
        effective date falls on or after the start date and before the end
        date. The end date itself is not locked.
      </p>
    </div>
    <button
      type="button"
      class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={listState === 'loading' || !tenantId}
      on:click={loadPeriods}
    >
      {listState === 'loading' ? 'Refreshing periods…' : 'Refresh periods'}
    </button>
  </div>

  <div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
    <form
      class="rounded-lg border border-gray-200 bg-gray-50 p-4"
      on:submit|preventDefault={previewPeriod}
    >
      <h4 class="text-sm font-semibold text-gray-950">Review a period before closing</h4>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label for="financial-period-label" class="crm-ui-label-xs">
            Period label
          </label>
          <input
            id="financial-period-label"
            type="text"
            bind:value={label}
            maxlength="120"
            autocomplete="off"
            placeholder="Spring 2026"
            class="crm-ui-select"
          />
        </div>
        <div>
          <label for="financial-period-start" class="crm-ui-label-xs">
            Start date (included)
          </label>
          <input
            id="financial-period-start"
            type="date"
            bind:value={startDate}
            class="crm-ui-select"
          />
        </div>
        <div>
          <label for="financial-period-end" class="crm-ui-label-xs">
            End date (excluded)
          </label>
          <input
            id="financial-period-end"
            type="date"
            bind:value={endDate}
            class="crm-ui-select"
          />
        </div>
      </div>

      {#if label || startDate || endDate}
        <p
          class="mt-3 text-sm {periodValidationError ? 'text-red-700' : 'text-gray-600'}"
          role={periodValidationError ? 'alert' : undefined}
        >
          {periodValidationError || 'Date range is valid. Preview it before closing.'}
        </p>
      {/if}

      <button
        type="submit"
        class="mt-4 rounded-md border border-[#008194] bg-white px-3 py-2 text-sm font-semibold text-[#006d7c] hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={Boolean(periodValidationError) || previewState === 'loading' || !tenantId}
      >
        {previewState === 'loading' ? 'Reviewing records…' : 'Preview affected records'}
      </button>

      {#if previewState === 'error'}
        <div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <p>{previewError}</p>
          {#if previewRequestId}<p class="mt-1 text-xs">Support request: {previewRequestId}</p>{/if}
        </div>
      {/if}

      {#if previewMatchesInput && preview}
        <div class="mt-4 rounded-md border {preview.truncated ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50'} p-4">
          <h5 class="text-sm font-semibold {preview.truncated ? 'text-red-950' : 'text-emerald-950'}">
            {preview.truncated ? 'Preview incomplete — closing is blocked' : 'Preview complete'}
          </h5>
          <dl class="mt-3 grid gap-2 sm:grid-cols-2">
            {#each Object.entries(preview.collections) as [collection, result] (collection)}
              <div class="rounded border border-black/10 bg-white/70 p-2">
                <dt class="text-xs font-medium text-gray-600">{humanizeStatus(collection)}</dt>
                <dd class="mt-1 text-sm font-semibold text-gray-950">
                  {result.count} {result.count === 1 ? 'record' : 'records'}
                  {result.truncated ? ' · incomplete' : ''}
                </dd>
              </div>
            {/each}
          </dl>
          <p class="mt-3 text-xs {preview.truncated ? 'text-red-800' : 'text-emerald-900'}">
            The backend preview also returns unsegmented minor-unit sums. They
            are intentionally not shown as currency totals because a period can
            contain more than one currency.
          </p>
        </div>

        {#if !preview.truncated}
          <div class="mt-4 space-y-3 border-t border-gray-200 pt-4">
            <div>
              <label for="financial-period-close-reason" class="crm-ui-label-xs">
                Audit reason
              </label>
              <textarea
                id="financial-period-close-reason"
                bind:value={closeReason}
                minlength="3"
                maxlength="500"
                rows="2"
                placeholder="Why is this period being closed?"
                class="crm-ui-select"
              ></textarea>
            </div>
            <div>
              <label for="financial-period-close-confirmation" class="crm-ui-label-xs">
                Type <span class="font-semibold">{closeConfirmationText}</span>
              </label>
              <input
                id="financial-period-close-confirmation"
                type="text"
                bind:value={closeConfirmation}
                autocomplete="off"
                class="crm-ui-select"
              />
            </div>
            <button
              type="button"
              class="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                closeState === 'loading'
                || closeReason.trim().length < 3
                || closeReason.trim().length > 500
                || closeConfirmation !== closeConfirmationText
              }
              on:click={closePeriod}
            >
              {closeState === 'loading' ? 'Closing period…' : 'Close financial period'}
            </button>
          </div>
        {/if}
      {/if}

      {#if preview && !previewMatchesInput}
        <p class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          The period inputs changed. Run the preview again before closing.
        </p>
      {/if}
      {#if closeState === 'error'}
        <div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <p>{closeError}</p>
          {#if closeRequestId}<p class="mt-1 text-xs">Support request: {closeRequestId}</p>{/if}
        </div>
      {:else if closeSuccess}
        <p class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          {closeSuccess}
        </p>
      {/if}
    </form>

    <div class="min-w-0">
      <h4 class="text-sm font-semibold text-gray-950">Recorded periods</h4>
      <p class="mt-1 text-xs text-gray-600">
        Reopening is audited and removes that period’s lock.
      </p>

      {#if listState === 'loading'}
        <div class="mt-3 rounded-md border border-gray-200 p-5 text-center text-sm text-gray-600" role="status">
          Loading financial periods…
        </div>
      {:else if listState === 'error'}
        <div class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <p>{listError}</p>
          {#if listRequestId}<p class="mt-1 text-xs">Support request: {listRequestId}</p>{/if}
          <button type="button" class="mt-2 rounded border border-red-300 bg-white px-2 py-1 font-medium" on:click={loadPeriods}>
            Retry
          </button>
        </div>
      {:else if listState === 'ready' && periods.length === 0}
        <div class="mt-3 rounded-md border border-gray-200 p-5 text-center text-sm text-gray-600">
          No financial periods have been recorded for this organization.
        </div>
      {:else if listState === 'ready'}
        {#if periodsTruncated}
          <p class="crm-ui-notice-spaced" role="alert">
            Only the first 100 periods are loaded. The history is incomplete.
          </p>
        {/if}
        <ul class="mt-3 space-y-3">
          {#each periods as period (period.id)}
            <li class="rounded-md border border-gray-200 p-3">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-gray-950">{period.label}</p>
                  <p class="mt-1 text-xs text-gray-600">
                    {periodDateLabel(period.startDate)} through
                    {periodDateLabel(period.endDate)} (end excluded)
                  </p>
                  <span class="mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {period.status === 'closed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}">
                    {period.status === 'closed' ? 'Closed' : 'Reopened'}
                  </span>
                </div>
                {#if period.status === 'closed' && reopenPeriodId !== period.id}
                  <button
                    type="button"
                    class="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                    on:click={() => beginReopen(period.id)}
                  >
                    Review reopen
                  </button>
                {/if}
              </div>

              {#if reopenPeriodId === period.id}
                <div class="mt-3 space-y-3 border-t border-gray-200 pt-3">
                  <p class="text-xs text-amber-900">
                    Reopening permits administrative changes in this date range
                    unless another closed period also covers the effective date.
                  </p>
                  <div>
                    <label for={`financial-period-reopen-reason-${period.id}`} class="crm-ui-label-xs">
                      Audit reason
                    </label>
                    <textarea
                      id={`financial-period-reopen-reason-${period.id}`}
                      bind:value={reopenReason}
                      minlength="3"
                      maxlength="500"
                      rows="2"
                      class="crm-ui-input"
                      placeholder="Why must this period be reopened?"
                    ></textarea>
                  </div>
                  <div>
                    <label for={`financial-period-reopen-confirmation-${period.id}`} class="crm-ui-label-xs">
                      Type <span class="font-semibold">{reopenConfirmationText}</span>
                    </label>
                    <input
                      id={`financial-period-reopen-confirmation-${period.id}`}
                      type="text"
                      bind:value={reopenConfirmation}
                      autocomplete="off"
                      class="crm-ui-input"
                    />
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        reopenState === 'loading'
                        || reopenReason.trim().length < 3
                        || reopenReason.trim().length > 500
                        || reopenConfirmation !== reopenConfirmationText
                      }
                      on:click={reopenPeriod}
                    >
                      {reopenState === 'loading' ? 'Reopening period…' : 'Reopen financial period'}
                    </button>
                    <button
                      type="button"
                      class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
                      disabled={reopenState === 'loading'}
                      on:click={cancelReopen}
                    >
                      Cancel
                    </button>
                  </div>
                  {#if reopenState === 'error'}
                    <div class="crm-ui-danger" role="alert">
                      <p>{reopenError}</p>
                      {#if reopenRequestId}<p class="mt-1 text-xs">Support request: {reopenRequestId}</p>{/if}
                    </div>
                  {:else if reopenSuccess}
                    <p class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
                      {reopenSuccess}
                    </p>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</section>
