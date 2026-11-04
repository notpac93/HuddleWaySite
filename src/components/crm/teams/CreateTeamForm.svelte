<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import Icon from '../ui/Icon.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import { refreshOperationalCollections } from '../../../lib/services/DataStore';

  const dispatch = createEventDispatcher();

  export let team: any = null;
  export let parentTeam: any = null;

  const initialIsActive = team?.isActive !== false && !['inactive', 'archived', 'deleted'].includes(String(team?.status || '').toLowerCase());
  let isActive = initialIsActive;
  let confirmDeactivation = false;
  let name = team ? team.name : '';
  let description = team ? team.description || '' : '';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let operationSignature = '';
  let operationKey = '';
  let operationGeneration = 0;
  let successTimer: ReturnType<typeof setTimeout> | null = null;
  let formSignature = '';

  $: parentTeamId = String(
    team?.parentTeamId || parentTeam?.id || '',
  ).trim() || null;
  $: parentTeamName = String(parentTeam?.name || '').trim();
  $: auditReason = team?.id
    ? 'Team details updated from Teams & Divisions.'
    : parentTeamName
      ? `Sub-team created under ${parentTeamName}.`
      : 'Team created from Teams & Divisions.';

  function buildOperationSignature() {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      teamId: team?.id || '',
      name: name.trim(),
      description: description.trim(),
      isActive,
      parentTeamId,
      auditReason: auditReason.trim(),
    });
  }

  $: formSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    teamId: team?.id || '',
    name: name.trim(),
    description: description.trim(),
    isActive,
    parentTeamId,
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
      || confirmDeactivation
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
        description: description.trim(),
        parentTeamId,
        ...(isActive !== initialIsActive ? { status: (isActive ? 'active' : 'inactive') as 'active' | 'inactive' } : {}),
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
      refreshOperationalCollections('teams');
      submitState = 'success';
      successTimer = setTimeout(() => {
        dispatch('success', {
          action: team?.id ? 'updated' : 'created',
          name: name.trim(),
        });
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
      errorMessage = 'The team could not be saved.';
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
    <button type="button" class="team-editor-backdrop" aria-label="Cancel team form" tabindex="-1" disabled={submitState === 'loading'} on:click={handleCancel}></button>

    <!-- Center modal trick -->
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="team-editor" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <form on:submit|preventDefault={handleSubmit}>
        <header class="team-editor-header">
          <div class="team-editor-heading"><span class="team-editor-mark"><Icon name="teams" size={22} /></span><h3 id="modal-title">{team ? 'Edit Team' : 'Create New Team'}</h3></div>
          <button type="button" class="team-editor-close" aria-label="Close team form" disabled={submitState === 'loading'} on:click={handleCancel}><Icon name="close" size={20} /></button>
        </header>
        <div class="team-editor-body">
          {#if !team && parentTeamName}
            <p class="mb-4 text-sm text-gray-600">
              This team will be created under <strong>{parentTeamName}</strong>.
            </p>
          {/if}

          <div class="space-y-4">
            <div>
              <label for="team-name" class="crm-ui-label">Team Name *</label>
              <input type="text" id="team-name" bind:value={name} required disabled={submitState === 'loading'} class="crm-ui-auth-input team-editor-input" placeholder="e.g. Varsity Basketball">
            </div>


            <div class="team-activity">
              <div><strong>{isActive ? 'Active' : 'Inactive'}</strong><span>{isActive ? 'Visible in the app' : 'Hidden from the app'}</span></div>
              <button type="button" role="switch" aria-label="Team active" aria-checked={isActive} class="team-activity-switch" class:on={isActive} disabled={submitState === 'loading' || submitState === 'success'} on:click={() => { if (isActive) confirmDeactivation = true; else isActive = true; }}><span></span></button>
            </div>
            {#if confirmDeactivation}
              <div class="team-deactivate-review" role="alertdialog" aria-modal="true" aria-labelledby="team-deactivate-title" tabindex="-1" use:modalFocus={{ onEscape: () => confirmDeactivation = false }}>
                <h4 id="team-deactivate-title">Deactivate {name.trim() || 'team'}?</h4>
                <p>The team will be hidden from the app when you save.</p>
                <div><button type="button" class="crm-ui-button-secondary" on:click={() => confirmDeactivation = false}>Keep active</button><button type="button" class="crm-ui-button-primary" on:click={() => { isActive = false; confirmDeactivation = false; }}>Deactivate</button></div>
              </div>
            {/if}
            {#if errorMessage}
              <p class="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>
            {/if}
          </div>
        </div>
        <div class="team-editor-actions">
          <StatusButton
            type="submit"
            state={submitState}
            disabled={!name.trim() || confirmDeactivation}
            idleText={team ? 'Save Team' : 'Create Team'}
            loadingText={team ? 'Saving...' : 'Creating...'}
            successText={team ? 'Saved!' : 'Created!'}
            errorText={team ? 'Retry Save' : 'Retry Create'}
            class="crm-auth-button-primary"
          />
          <button type="button" on:click={handleCancel} disabled={submitState === 'loading'} class="crm-auth-button-secondary">
            Cancel
          </button>
        </div>
        {#if team?.id}
          <div class="team-editor-delete"><button type="button" disabled={submitState === 'loading' || submitState === 'success' || confirmDeactivation} on:click={() => dispatch('delete', team)}><Icon name="trash" size={16} /> Delete team</button></div>
        {/if}
      </form>
    </div>
  </div>
</div>

<style>
  .team-editor-backdrop{position:fixed;inset:0;z-index:0;width:100%;height:100%;background:rgba(3,15,40,.7)}
  .team-editor{position:relative;z-index:10;display:inline-block;vertical-align:middle;width:100%;max-width:480px;max-height:calc(100dvh - 32px);overflow-y:auto;text-align:left;border:1px solid var(--crm-brand-border);border-radius:1.25rem;background:white;box-shadow:0 28px 70px rgba(3,15,40,.32);margin:16px 0}
  .team-editor-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;color:white;border-bottom:1px solid var(--crm-brand-secondary);background:linear-gradient(135deg,var(--crm-brand-sidebar),var(--crm-brand-primary))}
  .team-editor-heading{display:flex;align-items:center;gap:12px;min-width:0}
  .team-editor-heading h3{font-size:1.35rem;font-weight:700;line-height:1.3;margin:0;overflow-wrap:anywhere}
  .team-editor-mark{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.12);color:var(--crm-brand-secondary);flex-shrink:0}
  .team-editor-close{display:grid;place-items:center;min-width:44px;min-height:44px;color:white;border:0;border-radius:10px;background:transparent}
  .team-editor-close:hover{background:rgba(255,255,255,.12)}
  .team-editor-close:focus-visible{outline:3px solid var(--crm-brand-secondary);outline-offset:2px}
  .team-editor-body{padding:24px}
  .team-activity{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:4px}
  .team-activity strong{display:block;font-size:.875rem;font-weight:600;color:#172b40}.team-activity div>span{display:block;margin-top:3px;font-size:.75rem;color:#607087}
  .team-activity-switch{position:relative;width:48px;min-width:48px;height:44px;min-height:44px;border:0;border-radius:20px;background:transparent;padding:3px}.team-activity-switch:before{content:"";position:absolute;inset:8px 0;background:#cbd4df;border-radius:20px}.team-activity-switch.on:before{background:var(--crm-brand-control)}
  .team-activity-switch>span{position:absolute;left:3px;top:11px;display:block;width:22px;height:22px;border-radius:50%;background:white;transition:transform 120ms ease}.team-activity-switch.on>span{transform:translateX(20px)}
  .team-activity-switch:focus-visible{outline:3px solid var(--crm-brand-secondary);outline-offset:4px}.team-activity-switch:disabled{opacity:.5}
  .team-deactivate-review{padding:14px;border:1px solid var(--crm-brand-border);border-radius:12px;background:var(--crm-brand-surface);color:#172b40}.team-deactivate-review h4{font-size:1rem;font-weight:600;margin:0 0 6px}.team-deactivate-review p{font-size:.875rem;margin:0 0 14px}.team-deactivate-review>div{display:flex;gap:10px;flex-wrap:wrap}
  @media(prefers-reduced-motion:reduce){.team-activity-switch>span{transition:none}}
  .team-editor-delete{margin:0 24px;padding:12px 0 16px;border-top:1px solid #e2e7ed}
  .team-editor-delete button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;width:100%;border:0;background:none;color:#b42318;font-size:.875rem;font-weight:600}
  .team-editor-delete button:disabled{opacity:.5;cursor:not-allowed}
  .team-editor-input{font-size:1rem;min-height:46px}
  .team-editor-actions{display:flex;flex-direction:row-reverse;gap:12px;padding:0 24px 24px}
  .team-editor-actions :global(.crm-auth-button-primary){flex:1.5;width:auto}
  .team-editor-actions :global(.crm-auth-button-secondary){flex:1;width:auto}
  @media(max-width:380px){.team-editor-header,.team-editor-body{padding:18px}.team-editor-actions{padding:0 18px 18px}}
</style>
