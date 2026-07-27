<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../lib/api/BackendApi';
  import StatusButton from './ui/StatusButton.svelte';
  import { modalFocus } from '../../lib/ui/modalFocus';

  const dispatch = createEventDispatcher();

  let email = '';
  let firstName = '';
  let lastName = '';
  let role: 'editor' | 'viewer' = 'editor';

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let idempotencyKey = createIdempotencyKey('staff-invite');
  let payloadSignature = '';

  $: {
    const signature = JSON.stringify({
      email: email.trim().toLocaleLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
    });
    if (signature !== payloadSignature && submitState !== 'loading') {
      payloadSignature = signature;
      idempotencyKey = createIdempotencyKey('staff-invite');
      if (submitState === 'error') submitState = 'idle';
      errorMessage = '';
    }
  }

  async function handleSubmit() {
    if (
      submitState === 'loading'
      || !email.trim()
      || !firstName.trim()
      || !lastName.trim()
    ) return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      errorMessage = 'Select an organization before managing staff.';
      return;
    }

    submitState = 'loading';
    errorMessage = '';
    try {
      await backendClient.createAdminInvite({
        tenantId,
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        idempotencyKey,
      });
      if ($tenantIdStore !== tenantId) return;
      submitState = 'success';
      dispatch('success');
      dispatch('close');
    } catch (e: unknown) {
      console.error('The staff invitation could not be sent.');
      if ($tenantIdStore !== tenantId) return;
      const supportId = e instanceof BackendApiError ? e.requestId : null;
      errorMessage = `The staff invitation could not be sent.${supportId ? ` Support request: ${supportId}` : ''}`;
      submitState = 'error';
    }
  }

  function handleCancel() {
    if (submitState === 'loading') return;
    dispatch('cancel');
    dispatch('close');
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel staff invitation" tabindex="-1" on:click={handleCancel}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <form on:submit|preventDefault={handleSubmit}>
        <div class="crm-ui-modal-body">
          <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">Invite Staff Member</h3>

          <div class="space-y-4">
            <div class="crm-ui-grid-two">
              <div>
                <label for="firstName" class="crm-ui-label">First Name *</label>
                <input type="text" id="firstName" bind:value={firstName} required class="crm-ui-input-blue">
              </div>
              <div>
                <label for="lastName" class="crm-ui-label">Last Name *</label>
                <input type="text" id="lastName" bind:value={lastName} required class="crm-ui-input-blue">
              </div>
            </div>

            <div>
              <label for="email" class="crm-ui-label">Email Address *</label>
              <input type="email" id="email" bind:value={email} required class="crm-ui-input-blue" placeholder="coach@example.com">
            </div>

            <div>
              <label for="role" class="crm-ui-label">Role</label>
              <select id="role" bind:value={role} class="crm-ui-input-blue">
                <option value="editor">Editor — manage program operations</option>
                <option value="viewer">Viewer — read-only access</option>
              </select>
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
            disabled={!email.trim() || !firstName.trim() || !lastName.trim() || submitState === 'loading'}
            idleText="Send Invite"
            loadingText="Sending..."
            successText="Sent!"
            errorText="Retry Invite"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#1a56db] text-base font-medium text-white hover:bg-[#1e40af] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a56db] sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
          />
          <button type="button" disabled={submitState === 'loading'} on:click={handleCancel} class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a56db] disabled:opacity-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
