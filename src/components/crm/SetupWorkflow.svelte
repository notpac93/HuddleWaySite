<script lang="ts">
  let step = 1;
  const totalSteps = 5;

  // Form State
  let programName = '';
  let primaryColor = '#1a56db';
  let firstTeamName = '';
  let isFinishing = false;
  let setupError = '';
  let setupRequestId = '';
  let setupComplete = false;
  let readinessState = 'unknown';
  let readinessBlockers: string[] = [];
  let operationKey = '';
  let operationSignature = '';

  function nextStep() {
    if (step < totalSteps) {
      step++;
    } else {
      finishSetup();
    }
  }

  function prevStep() {
    if (step > 1) {
      step--;
    }
  }

  import { auth } from '../../lib/firebase';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError } from '../../lib/api/BackendApi';

  $: {
    const signature = JSON.stringify({
      programName: programName.trim(),
      primaryColor,
      firstTeamName: firstTeamName.trim(),
    });
    if (signature !== operationSignature && !isFinishing) {
      operationSignature = signature;
      operationKey = '';
    }
  }

  function normalizeSlug(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function finishSetup() {
    if (isFinishing) return;
    if (!auth.currentUser) {
      setupError = 'Sign in is required to create an organization.';
      setupRequestId = '';
      return;
    }
    isFinishing = true;
    setupError = '';
    setupRequestId = '';

    try {
      const tenantId = normalizeSlug(programName);
      const teamId = normalizeSlug(firstTeamName);
      if (!tenantId || !teamId) {
        throw new Error('Enter a valid organization and team name.');
      }

      if (!operationKey) {
        operationKey = `web_${crypto.randomUUID()}`;
      }
      const payload = await backendClient.bootstrapOrganization({
        tenantId,
        programName: programName.trim(),
        ownerInviteEmail: '',
        domains: [],
        branding: {
          logoUrl: '',
          colors: {
            primary: primaryColor,
            secondary: '#E5E7EB',
            accent: '#D32F2F',
          },
          pageLabels: {},
        },
        runtimeConfig: {
          defaultTeamId: teamId,
          onboardingMode: 'self-service',
          features: {
            registration_enabled: false,
            wall_enabled: false,
            show_coaches: false,
          },
          registration: {
            enabled: false,
            requirePaymentBeforeSubmit: false,
          },
          teams: [{
            teamId,
            name: firstTeamName.trim(),
            label: firstTeamName.trim(),
            addAsPage: true,
          }],
        },
      }, operationKey);
      if (payload.tenantId !== tenantId) {
        throw new Error('The setup service returned an unexpected organization.');
      }

      const readiness = payload.readiness;
      readinessState =
        readiness && typeof readiness === 'object'
          ? String((readiness as Record<string, unknown>).state || 'unknown')
          : 'unknown';
      const blockers =
        readiness && typeof readiness === 'object'
          ? (readiness as Record<string, unknown>).blockers
          : [];
      readinessBlockers = Array.isArray(blockers)
        ? blockers.map(String).filter(Boolean)
        : [];
      setupComplete = true;
    } catch (e: unknown) {
      console.error('Organization setup could not be completed.');
      setupRequestId = e instanceof BackendApiError ? e.requestId || '' : '';
      setupError = e instanceof BackendApiError
        ? e.message
        : 'Organization setup could not be completed. Review the form and try again.';
    } finally {
      isFinishing = false;
    }
  }

  // Derived state to check if step is valid before allowing "Next"
  $: canProceed = () => {
    if (step === 1) return programName.trim().length >= 2 && programName.trim().length <= 120;
    if (step === 2) return /^#[0-9a-fA-F]{6}$/.test(primaryColor);
    if (step === 3) return firstTeamName.trim().length >= 2 && firstTeamName.trim().length <= 120;
    if (step === 4) return true; // Stripe is skippable/handled via separate flow
    return true;
  };
</script>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
  <div class="sm:mx-auto sm:w-full sm:max-w-xl">
    <div class="text-center mb-8">
      <h2 class="text-3xl font-extrabold text-gray-900">Set up your organization</h2>
      <p class="mt-2 text-sm text-gray-600">Program creation and administration are free. No payment method is required.</p>
    </div>

    <!-- Progress Bar (Momentum & Progress UX Principle) -->
    <div class="mb-8">
      <div class="overflow-hidden rounded-full bg-gray-200 h-2">
        <div class="h-2 bg-indigo-600 rounded-full transition-all duration-500 ease-in-out" style="width: {(step / totalSteps) * 100}%"></div>
      </div>
      <div class="mt-2 text-right text-xs font-medium text-gray-500">Step {step} of {totalSteps}</div>
    </div>

    <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">

      {#if step === 1}
        <!-- Step 1: Program Info (Low friction starting step) -->
        <div class="space-y-6">
          <div>
            <h3 class="crm-ui-subtitle">What's your program called?</h3>
            <p class="text-sm text-gray-500 mb-4">This is the name parents and players will see.</p>
            <label for="setup-program-name" class="sr-only">Organization name</label>
            <input id="setup-program-name" type="text" bind:value={programName} minlength="2" maxlength="120" placeholder="e.g., Elite Soccer Academy" class="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
          </div>
        </div>

      {:else if step === 2}
        <!-- Step 2: Brand Identity (IKEA Effect) -->
        <div class="space-y-6">
          <h3 class="crm-ui-subtitle">Make it yours</h3>
          <p class="text-sm text-gray-500">Choose a brand color to customize your app's appearance.</p>

          <div class="flex items-center space-x-4 border border-gray-200 p-4 rounded-lg bg-gray-50">
            <input type="color" bind:value={primaryColor} aria-label="Primary organization color" class="h-14 w-14 rounded cursor-pointer p-0 border-0 shadow-sm">
            <div class="flex-1">
              <input type="text" bind:value={primaryColor} aria-label="Primary organization color hex value" maxlength="7" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm uppercase font-mono text-gray-600">
            </div>
          </div>

          <!-- Live Preview -->
          <div class="mt-6 border border-gray-200 rounded-lg overflow-hidden">
            <div class="bg-white p-4">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-full" style="background-color: {primaryColor}"></div>
                  <span class="font-medium text-gray-900">{programName || 'Your Program'}</span>
                </div>
              </div>
              <div
                class="w-full text-center text-white py-2 rounded-md font-medium text-sm"
                style="background-color: {primaryColor}"
                aria-hidden="true"
              >
                App preview
              </div>
            </div>
          </div>
        </div>

      {:else if step === 3}
        <!-- Step 3: First Team (Momentum & IKEA Effect) -->
        <div class="space-y-6">
          <h3 class="crm-ui-subtitle">Create your first team</h3>
          <p class="text-sm text-gray-500">Let's set up the structure so you can start adding players right away.</p>

          <div>
            <label for="setup-team-name" class="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <input id="setup-team-name" type="text" bind:value={firstTeamName} minlength="2" maxlength="120" placeholder="e.g., U12 Boys Varsity" class="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
          </div>
          <div class="bg-blue-50 border-l-4 border-blue-400 p-4 mt-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-blue-700">You can create additional teams later.</p>
              </div>
            </div>
          </div>
        </div>

      {:else if step === 4}
        <!-- Step 4: Stripe Connect (Trust & Value) -->
        <div class="space-y-6 text-center">
          <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 mb-4">
            <svg class="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 class="text-xl font-medium text-gray-900">Payments setup</h3>
          <p class="text-sm text-gray-500 max-w-sm mx-auto">Payment processing is optional. Connect Stripe later only if your program chooses to collect participant fees.</p>

          <div class="pt-4">
            <div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-800">
              Free setup does not connect a payment account or charge an activation fee.
            </div>
            <button on:click={nextStep} class="mt-4 w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Skip payment setup
            </button>
            <button type="button" on:click={prevStep} class="mt-3 text-sm font-medium text-gray-600 hover:text-gray-900">
              Back to team details
            </button>
          </div>
        </div>

      {:else if step === 5}
        <div class="space-y-6 text-center py-4">
          <div class="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-100">
            <svg class="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 class="crm-ui-page-title">{setupComplete ? 'Organization created' : 'Review organization setup'}</h3>
          {#if setupComplete}
            <p class="text-base text-gray-500">{programName} was created. Organization creation is separate from launch readiness.</p>
            <div class="rounded-md border border-gray-200 bg-gray-50 p-4 text-left text-sm text-gray-800">
              <p><strong>Server readiness:</strong> {readinessState}</p>
              {#if readinessBlockers.length > 0}
                <p class="mt-2 font-medium">Remaining blockers</p>
                <ul class="mt-1 list-disc pl-5">
                  {#each readinessBlockers as blocker}<li>{blocker}</li>{/each}
                </ul>
              {:else if readinessState !== 'ready'}
                <p class="mt-2">The server did not return detailed blockers. Verify payments, domain, logo, and content before launch.</p>
              {/if}
            </div>
          {:else}
            <p class="text-base text-gray-500">Create {programName} with the first team {firstTeamName}. Payments remain unconfigured.</p>
          {/if}
        </div>
      {/if}

      <!-- Footer Controls -->
      {#if step < 4}
        <div class="mt-10 flex items-center justify-between border-t border-gray-100 pt-6">
          <button on:click={prevStep} class="text-sm font-medium text-gray-500 hover:text-gray-700 {step === 1 ? 'invisible' : ''}">
            Back
          </button>

          <button
            on:click={nextStep}
            disabled={!canProceed()}
            class="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            Continue
          </button>
        </div>
      {/if}
      {#if step === 5}
        <div class="mt-8">
          {#if setupError}
            <div class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700" role="alert">
              {setupError}
              {#if setupRequestId}<span class="mt-1 block text-xs">Support request: {setupRequestId}</span>{/if}
            </div>
          {/if}
          {#if setupComplete}
          <button type="button" on:click={() => window.location.href = '/admin'} class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
            Continue to dashboard
          </button>
          {:else}
          <div class="flex flex-col gap-3 sm:flex-row-reverse">
            <button type="button" on:click={finishSetup} disabled={isFinishing} class="flex flex-1 justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50">
              {isFinishing ? 'Creating organization…' : 'Create organization'}
            </button>
            <button type="button" on:click={prevStep} disabled={isFinishing} class="flex justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Back
            </button>
          </div>
          {/if}
        </div>
      {/if}

    </div>
  </div>
</div>
