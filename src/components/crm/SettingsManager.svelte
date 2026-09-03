<script lang="ts">
  import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    signOut,
    updatePassword,
    updateProfile,
    verifyBeforeUpdateEmail,
  } from 'firebase/auth';
  import { userStore } from '../../lib/authStore';
  import { auth } from '../../lib/firebase';
  import StatusButton from './ui/StatusButton.svelte';

  let loadedUserId = '';
  let displayName = '';
  let email = '';
  let currentPassword = '';
  let pendingEmail = '';
  let saveError = '';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let passwordCurrent = '';
  let passwordNew = '';
  let passwordConfirmation = '';
  let passwordError = '';
  let passwordSubmitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let showEmailPassword = false;
  let showCurrentPassword = false;
  let showNewPassword = false;
  let showConfirmationPassword = false;
  let verificationState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let verificationMessage = '';

  $: if ($userStore && loadedUserId !== $userStore.uid) {
    loadedUserId = $userStore.uid;
    displayName = $userStore.displayName || '';
    email = $userStore.email || '';
    currentPassword = '';
    pendingEmail = '';
  }

  $: currentEmail = ($userStore?.email || '').trim().toLowerCase();
  $: currentDisplayName = ($userStore?.displayName || '').trim();
  $: normalizedEmail = email.trim().toLowerCase();
  $: emailChangeRequested = Boolean(
    currentEmail && normalizedEmail && normalizedEmail !== currentEmail,
  );
  $: profileChanged = displayName.trim() !== currentDisplayName
    || emailChangeRequested;
  $: passwordChecks = {
    length: passwordNew.length >= 8,
    different: Boolean(passwordNew) && passwordNew !== passwordCurrent,
    matches: Boolean(passwordConfirmation) && passwordNew === passwordConfirmation,
  };

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function profileErrorMessage(error: unknown, emailChange = false) {
    const code = String((error as { code?: unknown })?.code || '');
    if (code.includes('requires-recent-login')) {
      return emailChange
        ? 'Sign in again before changing your email address.'
        : 'Sign out and sign in again before changing your display name.';
    }
    if (code.includes('email-already-in-use')) {
      return 'That email address is already connected to another account.';
    }
    if (code.includes('invalid-email')) {
      return 'Enter a valid email address.';
    }
    if (code.includes('network-request-failed')) {
      return 'The profile service could not be reached. Check your connection and try again.';
    }
    return 'Profile changes could not be saved.';
  }

  function passwordErrorMessage(error: unknown) {
    const code = String((error as { code?: unknown })?.code || '');
    if (code.includes('wrong-password') || code.includes('invalid-credential')) {
      return 'The current password is incorrect.';
    }
    if (code.includes('requires-recent-login')) {
      return 'Sign in again before changing your password.';
    }
    if (code.includes('weak-password')) {
      return 'The new password must be at least 8 characters.';
    }
    if (code.includes('network-request-failed')) {
      return 'The password service could not be reached. Check your connection and try again.';
    }
    return 'The password could not be changed. Check the current password and try again.';
  }

  async function changePassword() {
    const user = $userStore;
    if (!user || passwordSubmitState === 'loading') return;
    passwordError = '';
    if (!user.email) {
      passwordError = 'This account does not have an email password that can be changed here.';
      passwordSubmitState = 'error';
      return;
    }
    if (passwordNew.length < 8) {
      passwordError = 'The new password must be at least 8 characters.';
      passwordSubmitState = 'error';
      return;
    }
    if (passwordNew !== passwordConfirmation) {
      passwordError = 'New passwords must match.';
      passwordSubmitState = 'error';
      return;
    }
    if (passwordNew === passwordCurrent) {
      passwordError = 'The new password must be different from the current password.';
      passwordSubmitState = 'error';
      return;
    }
    if (!passwordCurrent) {
      passwordError = 'Enter your current password.';
      passwordSubmitState = 'error';
      return;
    }

    passwordSubmitState = 'loading';
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordCurrent);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordNew);
      await signOut(auth);
      passwordCurrent = '';
      passwordNew = '';
      passwordConfirmation = '';
      passwordSubmitState = 'success';
    } catch (error) {
      console.error('Password could not be changed.');
      passwordError = passwordErrorMessage(error);
      passwordSubmitState = 'error';
    }
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
    if (!isValidEmail(normalizedEmail)) {
      saveError = 'Enter a valid email address.';
      submitState = 'error';
      return;
    }
    if (emailChangeRequested && !currentPassword) {
      saveError = 'Enter your current password to change the email address.';
      submitState = 'error';
      return;
    }

    submitState = 'loading';
    saveError = '';
    try {
      if (emailChangeRequested) {
        if (!user.email) {
          throw new Error('The signed-in account has no email address.');
        }
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword,
        );
        await reauthenticateWithCredential(user, credential);
        await verifyBeforeUpdateEmail(user, normalizedEmail);
        pendingEmail = normalizedEmail;
        currentPassword = '';
      }
      await updateProfile(user, { displayName: normalizedName });
      displayName = normalizedName;
      submitState = 'success';
      setTimeout(() => {
        if (submitState === 'success') submitState = 'idle';
      }, 1500);
    } catch (error) {
      console.error('Profile changes could not be saved.');
      saveError = profileErrorMessage(error, emailChangeRequested);
      submitState = 'error';
    }
  }

  async function resendEmailVerification() {
    const user = $userStore;
    if (!user?.email || !pendingEmail || !currentPassword || verificationState === 'loading') return;
    verificationState = 'loading';
    verificationMessage = '';
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, pendingEmail);
      currentPassword = '';
      verificationState = 'success';
      verificationMessage = `Verification instructions were resent to ${pendingEmail}.`;
    } catch (error) {
      verificationState = 'error';
      verificationMessage = profileErrorMessage(error, true);
    }
  }
</script>

<div class="h-full bg-white flex flex-col">
  <div class="px-8 py-6 border-b border-gray-200">
    <h2 class="crm-ui-page-title">My profile</h2>
    <p class="mt-1 text-sm text-gray-500">Manage your personal administrator identity and login credentials. Organization settings live in their owning portal tabs.</p>
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
          <label for="settings-email" class="crm-ui-label">Login email address</label>
          <input
            id="settings-email"
            type="email"
            bind:value={email}
            required
            autocomplete="email"
            class="crm-ui-input-indigo"
          >
          <p class="crm-ui-hint">A verification link will be sent to a new address. Your current address stays active until you verify it.</p>
        </div>

        {#if emailChangeRequested}
          <div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
            <strong>Before you change this address:</strong> HuddleWay will send account-verification instructions to <strong>{normalizedEmail}</strong>. This becomes your login and default reply address after verification. It does not change a personal mailbox connected in Messages.
          </div>
          <div>
            <label for="settings-current-password" class="crm-ui-label">Current password</label>
            <input
              id="settings-current-password"
              type={showEmailPassword ? 'text' : 'password'}
              bind:value={currentPassword}
              required
              minlength="6"
              autocomplete="current-password"
              class="crm-ui-input-indigo"
            >
            <button type="button" class="crm-theme-link mt-2 text-sm" aria-pressed={showEmailPassword} on:click={() => showEmailPassword = !showEmailPassword}>{showEmailPassword ? 'Hide password' : 'Show password'}</button>
            <p class="crm-ui-hint">Required to protect email changes.</p>
          </div>
        {/if}

        {#if pendingEmail}
          <div class="crm-theme-surface crm-theme-border rounded-md border p-3 text-sm" role="status">
            Account verification is waiting for <strong>{pendingEmail}</strong>. Follow the instructions sent there. If you also want customers to see this address as the sender, reconnect it from Messages after the login change is complete.
            <p class="mt-2 text-xs">To resend, enter the current login password above again.</p>
            {#if verificationMessage}<p class="mt-2 {verificationState === 'error' ? 'text-red-700' : 'text-green-700'}">{verificationMessage}</p>{/if}
            <div class="mt-3 flex flex-wrap gap-3"><button type="button" class="crm-theme-link font-medium" disabled={!currentPassword || verificationState === 'loading'} on:click={resendEmailVerification}>{verificationState === 'loading' ? 'Resending…' : 'Resend verification'}</button><button type="button" class="crm-theme-link font-medium" on:click={() => { email = currentEmail; pendingEmail = ''; currentPassword = ''; verificationMessage = ''; verificationState = 'idle'; saveError = 'The pending notice was cleared locally. Your current login email remains active unless the earlier verification link is completed.'; }}>Clear pending notice</button></div>
          </div>
        {/if}

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
            disabled={!$userStore
              || !profileChanged
              || displayName.trim().length < 2
              || displayName.trim().length > 120
              || !isValidEmail(normalizedEmail)
              || (emailChangeRequested && !currentPassword)}
            idleText="Save changes"
            loadingText="Saving..."
            successText="Saved"
            class="bg-[var(--crm-brand-control)] border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-[var(--crm-on-primary)] hover:bg-[var(--crm-brand-primary-hover)] disabled:opacity-50"
          />
        </div>
      </form>
    </div>

    <div class="max-w-3xl mt-6 bg-white shadow rounded-lg p-6">
      <h3 class="text-lg leading-6 font-medium text-gray-900">Change Password</h3>
      <p class="mt-1 text-sm text-gray-500">
        Verify your current password, choose a new one, and you will be signed out after it is saved.
      </p>
      <form class="mt-6 space-y-6" on:submit|preventDefault={changePassword}>
        <div>
          <label for="settings-password-current" class="crm-ui-label">Current password</label>
          <input
            id="settings-password-current"
            type={showCurrentPassword ? 'text' : 'password'}
            bind:value={passwordCurrent}
            required
            minlength="6"
            autocomplete="current-password"
            class="crm-ui-input-indigo"
          >
          <button type="button" class="crm-theme-link mt-2 text-sm" aria-pressed={showCurrentPassword} on:click={() => showCurrentPassword = !showCurrentPassword}>{showCurrentPassword ? 'Hide password' : 'Show password'}</button>
        </div>
        <div>
          <label for="settings-password-new" class="crm-ui-label">New password</label>
          <input
            id="settings-password-new"
            type={showNewPassword ? 'text' : 'password'}
            bind:value={passwordNew}
            required
            minlength="8"
            autocomplete="new-password"
            aria-describedby="settings-password-help"
            class="crm-ui-input-indigo"
          >
          <button type="button" class="crm-theme-link mt-2 text-sm" aria-pressed={showNewPassword} on:click={() => showNewPassword = !showNewPassword}>{showNewPassword ? 'Hide password' : 'Show password'}</button>
          <ul id="settings-password-help" class="mt-2 space-y-1 text-sm" aria-label="Password requirements"><li class={passwordChecks.length ? 'text-green-700' : 'text-gray-500'}>{passwordChecks.length ? '✓' : '○'} At least 8 characters</li><li class={passwordChecks.different ? 'text-green-700' : 'text-gray-500'}>{passwordChecks.different ? '✓' : '○'} Different from current password</li><li class={passwordChecks.matches ? 'text-green-700' : 'text-gray-500'}>{passwordChecks.matches ? '✓' : '○'} Confirmation matches</li></ul>
        </div>
        <div>
          <label for="settings-password-confirm" class="crm-ui-label">Confirm new password</label>
          <input
            id="settings-password-confirm"
            type={showConfirmationPassword ? 'text' : 'password'}
            bind:value={passwordConfirmation}
            required
            minlength="8"
            autocomplete="new-password"
            class="crm-ui-input-indigo"
          >
          <button type="button" class="crm-theme-link mt-2 text-sm" aria-pressed={showConfirmationPassword} on:click={() => showConfirmationPassword = !showConfirmationPassword}>{showConfirmationPassword ? 'Hide password' : 'Show password'}</button>
        </div>

        {#if passwordError}
          <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {passwordError}
          </div>
        {/if}

        {#if passwordSubmitState === 'success'}
          <div class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700" role="status">
            Password changed successfully. You have been signed out.
          </div>
        {/if}

        <div class="flex justify-end">
          <p class="mr-auto max-w-lg text-sm text-gray-500">Changing this password signs out this browser. Other existing sessions are not guaranteed to be revoked. After sign-in, the portal restores your last authorized location.</p>
          <StatusButton
            type="submit"
            state={passwordSubmitState}
            disabled={!$userStore || !passwordCurrent || passwordNew.length < 8 || passwordNew !== passwordConfirmation}
            idleText="Change Password"
            loadingText="Changing..."
            successText="Changed"
            class="bg-[var(--crm-brand-control)] border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-[var(--crm-on-primary)] hover:bg-[var(--crm-brand-primary-hover)] disabled:opacity-50"
          />
        </div>
      </form>
    </div>
  </div>
</div>
