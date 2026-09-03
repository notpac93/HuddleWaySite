<script lang="ts">
  import { auth } from '../../lib/firebase';
  import {
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    browserLocalPersistence,
  } from 'firebase/auth';

  let email = '';
  let password = '';
  let confirmPassword = '';
  let errorMessage = '';
  let successMessage = '';
  let isLoading = false;
  let view: 'login' | 'signup' | 'reset' = 'login';
  let showPassword = false;
  let resetDestination = '';

  function safeAuthError(
    operation: 'login' | 'signup' | 'reset',
    error: unknown,
  ) {
    const code = String((error as { code?: unknown })?.code || '');
    if (code.includes('too-many-requests')) {
      return 'Too many attempts. Wait a few minutes before trying again.';
    }
    if (code.includes('network-request-failed')) {
      return 'The authentication service could not be reached. Check your connection and try again.';
    }
    if (operation === 'login') {
      return 'Sign-in failed. Check your email and password, then try again.';
    }
    if (operation === 'signup') {
      return 'The free admin account could not be created. Review the form or sign in if you already have an account.';
    }
    return 'The reset request could not be completed. Try again later.';
  }

  async function handleSignup() {
    if (isLoading) return;
    errorMessage = '';
    successMessage = '';
    if (password !== confirmPassword) {
      errorMessage = 'Passwords must match.';
      return;
    }
    isLoading = true;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      password = '';
      confirmPassword = '';
      successMessage =
        'Your free admin account was created. Verify your email, then sign in to start free program setup.';
      view = 'login';
    } catch (error: unknown) {
      errorMessage = safeAuthError('signup', error);
    } finally {
      isLoading = false;
    }
  }

  async function handleLogin() {
    if (isLoading) return;
    errorMessage = '';
    successMessage = '';
    isLoading = true;
    try {
      // Require durable same-origin storage before accepting credentials. This
      // prevents an apparently successful, memory-only session from vanishing
      // when the browser replaces or suspends the current page context.
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      errorMessage = safeAuthError('login', error);
    } finally {
      isLoading = false;
    }
  }

  async function handleReset() {
    if (isLoading) return;
    errorMessage = '';
    successMessage = '';
    isLoading = true;
    try {
      await sendPasswordResetEmail(auth, email);
      resetDestination = maskEmail(email);
      successMessage = `If an account exists, a password reset link was sent to ${resetDestination}. You can request another link after 60 seconds.`;
      view = 'login';
    } catch (error: any) {
      errorMessage = safeAuthError('reset', error);
    } finally {
      isLoading = false;
    }
  }

  function maskEmail(value: string) {
    const [name, domain] = value.trim().split('@');
    if (!name || !domain) return 'the entered address';
    return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
  }
</script>

<div class="crm-auth-shell min-h-screen flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
  <div class="crm-auth-watermark" data-testid="huddleway-background-logo" aria-hidden="true"></div>
  <div class="relative z-10 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="flex justify-center">
      <div class="crm-auth-brand-mark">
        <img src="/logo.webp" alt="HuddleWay" class="h-20 w-20 rounded-[1.35rem] object-cover shadow-xl" />
      </div>
    </div>
    <h2 class="mt-6 text-center text-3xl font-extrabold text-white">
      Operations Portal
    </h2>
    <p class="mt-2 text-center text-sm font-medium text-[var(--crm-on-sidebar-muted)]">
      {#if view === 'login'}
        Sign in to manage your organization
      {:else if view === 'signup'}
        Create a free administrator account
      {:else}
        Reset your password
      {/if}
    </p>
  </div>

  <div class="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="crm-auth-card bg-white px-4 py-8 shadow-2xl sm:rounded-2xl sm:px-10">
      {#if view === 'login'}
        <form class="space-y-6" on:submit|preventDefault={handleLogin}>
          <div>
            <label for="email" class="crm-ui-label">
              Email address
            </label>
            <div class="mt-1">
              <input id="email" name="email" type="email" autocomplete="email" required bind:value={email}
                class="crm-ui-auth-input">
            </div>
          </div>

          <div>
            <div class="crm-ui-between">
              <label for="password" class="crm-ui-label">
                Password
              </label>
              <div class="text-sm">
                <div class="flex flex-wrap justify-end gap-x-3 gap-y-1">
                  <button type="button" class="crm-auth-link" on:click={() => { view = 'reset'; errorMessage = ''; successMessage = ''; }}>
                    Forgot your password?
                  </button>
                </div>
              </div>
            </div>
            <div class="mt-1">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autocomplete="current-password" required minlength="6" bind:value={password} aria-describedby="login-password-help"
                class="crm-ui-auth-input">
              <button type="button" class="crm-auth-link mt-2" aria-pressed={showPassword} on:click={() => showPassword = !showPassword}>{showPassword ? 'Hide password' : 'Show password'}</button>
              <p id="login-password-help" class="crm-ui-hint">Use your existing account password (minimum 6 characters).</p>
            </div>
          </div>

          {#if errorMessage}
            <div class="rounded-md bg-red-50 p-4" role="alert" aria-live="assertive">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-red-800">
                    {errorMessage}
                  </h3>
                </div>
              </div>
            </div>
          {/if}

          {#if successMessage}
            <div class="rounded-md bg-green-50 p-4" role="status" aria-live="polite">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-green-800">
                    {successMessage}
                  </h3>
                </div>
              </div>
            </div>
          {/if}

          <div>
            <button type="submit" disabled={isLoading}
              class="crm-auth-button-primary">
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <p class="text-center text-sm text-gray-600">
            Creating and administering a program is free. Stripe is optional and only needed if your program chooses to collect payments.
          </p>
          <p class="text-center text-xs text-gray-500">After sign-in, your last authorized organization and portal page will reopen.</p>
          <button
            type="button"
            class="crm-auth-button-secondary"
            on:click={() => { view = 'signup'; errorMessage = ''; successMessage = ''; password = ''; }}
          >
            Create free admin account
          </button>
        </form>
      {:else if view === 'signup'}
        <form class="space-y-6" on:submit|preventDefault={handleSignup}>
          <div class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            No activation fee or payment method is required. Verify your email to protect your program, then complete the guided setup.
          </div>
          <ol class="list-decimal space-y-1 pl-5 text-sm text-gray-700"><li>Create the administrator account.</li><li>Verify the email from your inbox.</li><li>Return and sign in.</li><li>Complete organization setup after HuddleWay grants or confirms access.</li></ol>
          <div>
            <label for="signup-email" class="crm-ui-label">Email address</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autocomplete="email"
              required
              bind:value={email}
              class="crm-ui-auth-select"
            >
          </div>
          <div>
            <label for="signup-password" class="crm-ui-label">Password</label>
            <input
              id="signup-password"
              name="new-password"
              type={showPassword ? 'text' : 'password'}
              autocomplete="new-password"
              required
              minlength="8"
              bind:value={password}
              class="crm-ui-auth-select"
            >
          </div>
          <button type="button" class="crm-auth-link" aria-pressed={showPassword} on:click={() => showPassword = !showPassword}>{showPassword ? 'Hide passwords' : 'Show passwords'}</button>
          <div>
            <label for="signup-password-confirmation" class="crm-ui-label">Confirm password</label>
            <input
              id="signup-password-confirmation"
              name="new-password-confirmation"
              type={showPassword ? 'text' : 'password'}
              autocomplete="new-password"
              required
              minlength="8"
              bind:value={confirmPassword}
              class="crm-ui-auth-select"
            >
          </div>
          {#if errorMessage}
            <div class="rounded-md bg-red-50 p-4 text-sm font-medium text-red-800" role="alert" aria-live="assertive">
              {errorMessage}
            </div>
          {/if}
          <button
            type="submit"
            disabled={isLoading}
            class="crm-auth-button-primary"
          >
            {isLoading ? 'Creating account…' : 'Create free admin account'}
          </button>
          <button
            type="button"
            class="w-full text-sm font-medium text-gray-600 hover:text-gray-900"
            on:click={() => { view = 'login'; errorMessage = ''; password = ''; confirmPassword = ''; }}
          >
            Back to sign in
          </button>
        </form>
      {:else}
        <form class="space-y-6" on:submit|preventDefault={handleReset}>
          <div>
            <label for="reset-email" class="crm-ui-label">
              Email address
            </label>
            <div class="mt-1">
              <input id="reset-email" name="email" type="email" autocomplete="email" required bind:value={email}
                class="crm-ui-auth-input">
            </div>
          </div>

          {#if errorMessage}
            <div class="rounded-md bg-red-50 p-4" role="alert" aria-live="assertive">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-red-800">
                    {errorMessage}
                  </h3>
                </div>
              </div>
            </div>
          {/if}

          <div>
            <button type="submit" disabled={isLoading}
              class="crm-auth-button-primary">
              {isLoading ? 'Sending...' : 'Send reset link'}
            </button>
          </div>

          <div class="text-sm text-center">
            <button type="button" class="font-medium text-gray-600 hover:text-gray-900" on:click={() => { view = 'login'; errorMessage = ''; }}>
              Back to sign in
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
</div>
