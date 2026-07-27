<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  const dispatch = createEventDispatcher();

  export let team = null;

  let name = team ? team.name : '';
  let description = team ? team.description || '' : '';
  let auditReason = '';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let operationSignature = '';
  let operationKey = '';
  let operationGeneration = 0;
  let successTimer: ReturnType<typeof setTimeout> | null = null;
  let formSignature = '';

  function buildOperationSignature() {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      teamId: team?.id || '',
      name: name.trim(),
      description: description.trim(),
      auditReason: auditReason.trim(),
    });
  }

  $: formSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    teamId: team?.id || '',
    name: name.trim(),
    description: description.trim(),
    auditReason: auditReason.trim(),
  });
  $: {
    const signature = formSignature;
    if (signature !== operationSignature) {
      const changedWhileLoading = submitState === 'loading';
      operationSignature = signature;
      operationKey = createIdempotencyKey(
        team?.id ? 'team-update' : 'team-create',
      );
      if (changedWhileLoading) {
        operationGeneration += 1;
        submitState = 'error';
        errorMessage =
          'The organization or team details changed while saving. Review the form and try again.';
      } else if (submitState === 'error') {
        submitState = 'idle';
        errorMessage = '';
      }
    }
  }

  onDestroy(() => {
    operationGeneration += 1;
    if (successTimer) clearTimeout(successTimer);
  });

  async function handleSubmit() {
    if (
      !name.trim()
      || auditReason.trim().length < 3
      || submitState === 'loading'
      || submitState === 'success'
    ) return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      errorMessage = 'Select an organization before saving a team.';
      return;
    }
    const generation = ++operationGeneration;
    const submittedSignature = buildOperationSignature();
    if (submittedSignature !== operationSignature) {
      operationSignature = submittedSignature;
      operationKey = createIdempotencyKey(
        team?.id ? 'team-update' : 'team-create',
      );
    }
    const idempotencyKey = operationKey || createIdempotencyKey(
      team?.id ? 'team-update' : 'team-create',
    );
    operationKey = idempotencyKey;

    submitState = 'loading';
    errorMessage = '';
    try {
      const data = {
        name: name.trim(),
        description: description.trim()
      };

      if (team && team.id) {
        await backendClient.updateTeam(
          tenantId,
          team.id,
          data,
          auditReason.trim(),
          idempotencyKey,
        );
      } else {
        await backendClient.createTeam(
          tenantId,
          data,
          auditReason.trim(),
          idempotencyKey,
        );
      }
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || operationSignature !== submittedSignature
      ) return;
      submitState = 'success';
      successTimer = setTimeout(() => {
        dispatch('success');
      }, 1500);
    } catch (e) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || operationSignature !== submittedSignature
      ) return;
      const supportId = e instanceof BackendApiError ? e.requestId : null;
      console.error(
        'Team save failed.',
        supportId ? { requestId: supportId } : {},
      );
      errorMessage =
        `The team could not be saved.`
        + `${supportId ? ` Support request: ${supportId}` : ''}`;
      submitState = 'error';
    }
  }

  function handleCancel() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    dispatch('cancel');
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">
    <!-- Background overlay -->
    <button type="button" class="fixed inset-0 z-0 h-full w-full bg-gray-500 bg-opacity-75 transition-opacity disabled:cursor-wait" aria-label="Cancel team form" tabindex="-1" disabled={submitState === 'loading'} on:click={handleCancel}></button>

    <!-- Center modal trick -->
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-y-auto shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full max-h-[calc(100vh-2rem)]" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <form on:submit|preventDefault={handleSubmit}>
        <div class="crm-ui-modal-body">
          <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
            {team ? 'Edit Team' : 'Create New Team'}
          </h3>

          <div class="space-y-4">
            <div>
              <label for="team-name" class="crm-ui-label">Team Name *</label>
              <input type="text" id="team-name" bind:value={name} required disabled={submitState === 'loading'} class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:cursor-wait disabled:opacity-50 sm:text-sm" placeholder="e.g. Varsity Basketball">
            </div>

            <div>
              <label for="team-desc" class="crm-ui-label">Description</label>
              <textarea id="team-desc" bind:value={description} rows="3" disabled={submitState === 'loading'} class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:cursor-wait disabled:opacity-50 sm:text-sm" placeholder="Optional description..."></textarea>
            </div>
            <div>
              <label for="team-audit-reason" class="crm-ui-label">Reason for change *</label>
              <input id="team-audit-reason" type="text" bind:value={auditReason} minlength="3" maxlength="500" required disabled={submitState === 'loading'} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:cursor-wait disabled:opacity-50" placeholder="Why is this team being created or changed?">
            </div>
            {#if errorMessage}
              <p class="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>
            {/if}
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <StatusButton
            type="submit"
            state={submitState}
            disabled={!name.trim() || auditReason.trim().length < 3}
            idleText={team ? 'Save Team' : 'Create Team'}
            loadingText={team ? 'Saving...' : 'Creating...'}
            successText={team ? 'Saved!' : 'Created!'}
            errorText={team ? 'Retry Save' : 'Retry Create'}
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
          />
          <button type="button" on:click={handleCancel} disabled={submitState === 'loading'} class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:cursor-wait disabled:opacity-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
