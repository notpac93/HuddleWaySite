<script lang="ts">
  import { updateProfile } from 'firebase/auth';
  import { userStore } from '../../lib/authStore';
  import StatusButton from './ui/StatusButton.svelte';

  let loadedUserId = '';
  let displayName = '';
  let email = '';
  let saveError = '';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';

  $: if ($userStore && loadedUserId !== $userStore.uid) {
    loadedUserId = $userStore.uid;
    displayName = $userStore.displayName || '';
    email = $userStore.email || '';
  }

  async function saveProfile() {
    const user = $userStore;
    const normalizedName = displayName.trim();
    if (!user || submitState === 'loading') return;
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      saveError = 'Display name must be between 2 and 120 characters.';
      submitState = 'error';
      return;
    }

    submitState = 'loading';
    saveError = '';
    try {
      await updateProfile(user, { displayName: normalizedName });
      displayName = normalizedName;
      submitState = 'success';
      setTimeout(() => {
        if (submitState === 'success') submitState = 'idle';
      }, 1500);
    } catch (error) {
      console.error('Profile changes could not be saved.');
      const code = String((error as { code?: unknown })?.code || '');
      saveError = code.includes('requires-recent-login')
        ? 'Sign out and sign in again before changing your display name.'
        : code.includes('network-request-failed')
          ? 'The profile service could not be reached. Check your connection and try again.'
          : 'Profile changes could not be saved.';
      submitState = 'error';
    }
  }
</script>

<div class="h-full bg-white flex flex-col">
  <div class="px-8 py-6 border-b border-gray-200">
    <h2 class="crm-ui-page-title">Settings</h2>
    <p class="mt-1 text-sm text-gray-500">Manage your personal administrator profile.</p>
  </div>

  <div class="flex-1 p-8 overflow-y-auto bg-gray-50">
    <div class="max-w-3xl bg-white shadow rounded-lg p-6">
      <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Personal information</h3>
      <form class="space-y-6" on:submit|preventDefault={saveProfile}>
        <div>
          <label for="settings-display-name" class="crm-ui-label">Display name</label>
          <input
            id="settings-display-name"
            type="text"
            bind:value={displayName}
            required
            minlength="2"
            maxlength="120"
            autocomplete="name"
            class="crm-ui-input-indigo"
          >
        </div>
        <div>
          <label for="settings-email" class="crm-ui-label">Email address</label>
          <input
            id="settings-email"
            type="email"
            disabled
            value={email}
            class="mt-1 block w-full bg-gray-100 border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-500 sm:text-sm"
          >
          <p class="crm-ui-hint">Email changes require account verification and are not handled by this profile form.</p>
        </div>

        {#if saveError}
          <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {saveError}
          </div>
        {/if}

        <div class="flex items-center justify-between gap-4">
          <p class="text-sm text-gray-500">Organization access and invitations are managed from Staff.</p>
          <StatusButton
            type="submit"
            state={submitState}
            disabled={!$userStore || displayName.trim().length < 2 || displayName.trim().length > 120}
            idleText="Save changes"
            loadingText="Saving..."
            successText="Saved"
            class="bg-indigo-600 border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          />
        </div>
      </form>
    </div>
  </div>
</div>
