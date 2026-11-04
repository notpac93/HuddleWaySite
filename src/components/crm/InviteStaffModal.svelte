<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { createIdempotencyKey } from '../../lib/api/BackendApi';
  import StatusButton from './ui/StatusButton.svelte';
  import { modalFocus } from '../../lib/ui/modalFocus';

  const dispatch = createEventDispatcher();

  let email = '';
  let firstName = '';
  let lastName = '';
  let role: 'editor' | 'viewer' = 'viewer';
  let reviewing = false;
  let heading: HTMLHeadingElement;
  let firstNameInput: HTMLInputElement;

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
      reviewing = false;
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
      errorMessage = 'The staff invitation could not be sent.';
      submitState = 'error';
    }
  }

  async function reviewInvite() {
    if (!email.trim() || !firstName.trim() || !lastName.trim()) return;
    reviewing = true;
    await tick(); heading?.focus();
  }

  async function editInvite() {
    if (submitState === 'loading') return;
    reviewing = false;
    errorMessage = '';
    if (submitState === 'error') submitState = 'idle';
    await tick(); firstNameInput?.focus();
  }

  function handleCancel() {
    if (submitState === 'loading') return;
    dispatch('cancel');
    dispatch('close');
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="staff-invite-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell staff-invite-shell">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel staff invitation" tabindex="-1" on:click={handleCancel}></button>
    <div class="staff-invite-card crm-auth-card relative z-10" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <form on:submit|preventDefault={() => reviewing ? handleSubmit() : reviewInvite()}>
        <header class="staff-invite-header">
          <h3 id="staff-invite-title" tabindex="-1" bind:this={heading}>{reviewing ? 'Send invitation?' : 'Invite staff'}</h3>
          <button type="button" class="invite-close" aria-label="Close invitation" disabled={submitState === 'loading'} on:click={handleCancel}>×</button>
        </header>
        <div class="staff-invite-body">
          {#if reviewing}
            <section class="invite-review" aria-label="Invitation review">
              <div class="invite-avatar" aria-hidden="true">{firstName.trim().slice(0,1)}{lastName.trim().slice(0,1)}</div>
              <h4>{firstName.trim()} {lastName.trim()}</h4>
              <p class="invite-email">{email.trim()}</p>
              <span class="invite-role">{role === 'editor' ? 'Editor' : 'Viewer'}</span>
              <p class="invite-permission">{role === 'editor' ? 'Manage program · No finances, staff, or activity access' : 'View dashboard · Read only'}</p>
            </section>
          {:else}
            <div class="invite-name-row">
              <div>
                <label for="firstName" class="crm-ui-label">First name *</label>
                <input type="text" id="firstName" bind:this={firstNameInput} bind:value={firstName} required autocomplete="given-name" class="crm-ui-auth-input">
              </div>
              <div>
                <label for="lastName" class="crm-ui-label">Last name *</label>
                <input type="text" id="lastName" bind:value={lastName} required autocomplete="family-name" class="crm-ui-auth-input">
              </div>
            </div>
            <div>
              <label for="email" class="crm-ui-label">Email *</label>
              <input type="email" id="email" bind:value={email} required autocomplete="email" class="crm-ui-auth-input" placeholder="coach@example.com">
            </div>
            <fieldset class="invite-access">
              <legend class="crm-ui-label">Access</legend>
              <div class="invite-role-options">
                <label class:selected={role === 'viewer'}>
                  <input type="radio" name="invite-role" value="viewer" bind:group={role} />
                  <strong>Viewer</strong><span>View dashboard</span>
                </label>
                <label class:selected={role === 'editor'}>
                  <input type="radio" name="invite-role" value="editor" bind:group={role} />
                  <strong>Editor</strong><span>Manage program</span>
                </label>
              </div>
              {#if role === 'editor'}<p class="invite-permission">No finances, staff, or activity access.</p>{/if}
            </fieldset>
          {/if}
          {#if errorMessage}<p class="invite-error" role="alert">{errorMessage}</p>{/if}
        </div>
        <div class="staff-invite-footer">
          <button type="button" disabled={submitState === 'loading'} on:click={() => reviewing ? editInvite() : handleCancel()} class="crm-auth-button-secondary">{reviewing ? 'Back' : 'Cancel'}</button>
          <StatusButton type="submit" state={submitState}
            disabled={!email.trim() || !firstName.trim() || !lastName.trim() || submitState === 'loading'}
            idleText={reviewing ? 'Send invite' : 'Continue'} loadingText="Sending…" successText="Sent" errorText="Try again"
            class="crm-auth-button-primary" />
        </div>
      </form>
    </div>
  </div>
</div>

<style>
  .staff-invite-shell{display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:16px}
  .staff-invite-card{text-align:left;display:block;width:100%;max-width:480px;margin:0;max-height:calc(100dvh - 32px);overflow-y:auto;border-radius:1.25rem}
  .staff-invite-header{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;background:linear-gradient(120deg,#173c62,#08244b);border-bottom:2px solid var(--crm-brand-secondary);color:white}
  .staff-invite-header h3{font-size:1.25rem;font-weight:750;line-height:1.3;margin:0;outline:none}
  .invite-close{display:grid;place-items:center;min-width:44px;min-height:44px;font-size:1.6rem;border:0;background:transparent;color:inherit;border-radius:.5rem}
  .staff-invite-body{display:flex;flex-direction:column;gap:1rem;padding:1.25rem}
  .invite-name-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
  .invite-name-row>div{min-width:0}
  .staff-invite-body input:not([type=radio]){min-height:46px;border-radius:.6rem;background:#f4f6f8}
  .invite-access{margin:0;padding:0;border:0;min-width:0}
  .invite-access legend{margin-bottom:.4rem}
  .invite-role-options{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
  .invite-role-options label{position:relative;display:flex;flex-direction:column;gap:.25rem;min-height:82px;padding:.85rem;border:1px solid #dce2e9;border-radius:.75rem;cursor:pointer;color:#17314d}
  .invite-role-options label.selected{border-color:var(--crm-brand-link);background:var(--crm-brand-surface);box-shadow:inset 0 0 0 1px var(--crm-brand-link)}
  .invite-role-options input{position:absolute;right:.8rem;top:.85rem;accent-color:var(--crm-brand-link);width:18px;height:18px}
  .invite-role-options strong{font-size:.875rem;padding-right:1.5rem}
  .invite-role-options span,.invite-permission{font-size:.8rem;color:#586a7d;line-height:1.45}
  .invite-access .invite-permission{margin:.6rem 0 0}
  .invite-review{text-align:center;padding:.5rem 0}
  .invite-avatar{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--crm-brand-surface);color:var(--crm-brand-link);font-size:1.15rem;font-weight:700;text-transform:uppercase;margin:0 auto .8rem}
  .invite-review h4{font-size:1.1rem;color:#17314d;font-weight:700;margin:0}
  .invite-email{margin:.35rem 0 .8rem;color:#586a7d;overflow-wrap:anywhere;font-size:.875rem}
  .invite-role{display:inline-block;border-radius:2rem;padding:.3rem .8rem;background:var(--crm-brand-surface);color:var(--crm-brand-link);font-size:.8rem;font-weight:700}
  .invite-review .invite-permission{margin:.6rem auto 0;max-width:300px}
  .invite-error{padding:.75rem;border-radius:.6rem;background:#fef2f2;color:#991b1b;font-size:.875rem}
  .staff-invite-footer{position:sticky;bottom:0;background:white;display:flex;gap:.75rem;padding:1rem 1.25rem 1.25rem;border-top:1px solid #e2e6ec}
  .staff-invite-footer :global(button){flex:1;width:auto;margin:0}
  .invite-role-options label:focus-within,.invite-close:focus-visible{outline:3px solid var(--crm-brand-secondary);outline-offset:3px}
  @media(max-width:360px){.staff-invite-body,.staff-invite-header,.staff-invite-footer{padding:1rem}.invite-role-options label{padding:.75rem}.invite-role-options span{font-size:.75rem}}
</style>
