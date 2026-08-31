<script lang="ts">
  import { onMount } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
    type AdminStaffDirectory,
  } from '../../lib/api/BackendApi';
  import InviteStaffModal from './InviteStaffModal.svelte';
  import { modalFocus } from '../../lib/ui/modalFocus';

  const STAFF_LIMIT = 100;

  let directory: AdminStaffDirectory | null = null;
  let activeTenantId = '';
  let loadGeneration = 0;
  let isLoading = false;
  let loadError = '';
  let requestId = '';
  let activeTab: 'Directory' | 'Invites' = 'Directory';
  let showModal = false;
  let searchQuery = '';
  let roleFilter = '';
  let manageTarget: AdminStaffDirectory['staff'][number] | null = null;
  let revokeTarget: AdminStaffDirectory['pendingInvites'][number] | null = null;
  let selectedRole: 'owner' | 'editor' | 'viewer' = 'viewer';
  let selectedStatus: 'active' | 'inactive' = 'active';
  let auditReason = '';
  let mutationState: 'idle' | 'loading' | 'error' = 'idle';
  let mutationMessage = '';
  let mutationRequestId = '';
  let mutationSignature = '';
  let mutationKey = '';

  $: normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  $: staffRows = (directory?.staff || []).filter((staff) => {
    if (roleFilter && staff.role !== roleFilter) return false;
    if (!normalizedSearch) return true;
    return [staff.displayName, staff.email, staff.uid]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
  });
  $: inviteRows = (directory?.pendingInvites || []).filter((invite) => {
    if (roleFilter && invite.role !== roleFilter) return false;
    if (!normalizedSearch) return true;
    return [invite.displayName, invite.email]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
  });
  $: activeRows = activeTab === 'Directory' ? staffRows : inviteRows;
  $: activeListTruncated = activeTab === 'Directory'
    ? directory?.truncated.staff
    : directory?.truncated.pendingInvites;
  $: {
    const signature = manageTarget
      ? JSON.stringify({
          kind: 'membership',
          id: manageTarget.membershipId,
          role: selectedRole,
          status: selectedStatus,
          auditReason: auditReason.trim(),
        })
      : revokeTarget
        ? JSON.stringify({
            kind: 'invite',
            id: revokeTarget.id,
            auditReason: auditReason.trim(),
          })
        : '';
    if (signature !== mutationSignature && mutationState !== 'loading') {
      mutationSignature = signature;
      mutationKey = signature ? createIdempotencyKey('staff-lifecycle') : '';
      if (mutationState === 'error') mutationState = 'idle';
    }
  }

  async function loadStaffDirectory(tenantId: string) {
    const generation = ++loadGeneration;
    if (!tenantId) {
      directory = null;
      isLoading = false;
      return;
    }
    isLoading = true;
    loadError = '';
    requestId = '';
    try {
      const result = await backendClient.adminStaffDirectory(tenantId, STAFF_LIMIT);
      if (generation !== loadGeneration || tenantId !== activeTenantId) return;
      if (result.tenantId !== tenantId) {
        throw new Error('The staff response did not match the selected organization.');
      }
      directory = result;
      requestId = result.requestId;
    } catch (error) {
      if (generation !== loadGeneration || tenantId !== activeTenantId) return;
      directory = null;
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
      loadError = error instanceof BackendApiError && error.status === 403
        ? 'Only organization owners can view and manage staff access.'
        : 'Staff access could not be loaded. Check your connection and try again.';
    } finally {
      if (generation === loadGeneration && tenantId === activeTenantId) {
        isLoading = false;
      }
    }
  }

  onMount(() => {
    const tenantUnsubscribe = tenantIdStore.subscribe((tenantId) => {
      loadGeneration += 1;
      activeTenantId = tenantId || '';
      directory = null;
      showModal = false;
      searchQuery = '';
      roleFilter = '';
      closeLifecycleDialog(true);
      if (tenantId) void loadStaffDirectory(tenantId);
      else isLoading = false;
    });
    return () => {
      loadGeneration += 1;
      tenantUnsubscribe();
    };
  });

  function formatDate(value: string | null) {
    if (!value) return 'Timestamp unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Timestamp unavailable'
      : date.toLocaleDateString();
  }

  function openManageDialog(staff: AdminStaffDirectory['staff'][number]) {
    manageTarget = staff;
    revokeTarget = null;
    selectedRole = staff.role;
    selectedStatus = staff.active ? 'active' : 'inactive';
    auditReason = '';
    mutationState = 'idle';
    mutationMessage = '';
    mutationRequestId = '';
  }

  function openRevokeDialog(invite: AdminStaffDirectory['pendingInvites'][number]) {
    revokeTarget = invite;
    manageTarget = null;
    auditReason = '';
    mutationState = 'idle';
    mutationMessage = '';
    mutationRequestId = '';
  }

  function closeLifecycleDialog(force = false) {
    if (!force && mutationState === 'loading') return;
    manageTarget = null;
    revokeTarget = null;
    auditReason = '';
    mutationState = 'idle';
    mutationSignature = '';
    mutationKey = '';
  }

  async function confirmLifecycleChange() {
    if (
      mutationState === 'loading'
      || auditReason.trim().length < 3
      || !mutationKey
      || !activeTenantId
    ) return;
    if (
      manageTarget
      && selectedRole === manageTarget.role
      && selectedStatus === (manageTarget.active ? 'active' : 'inactive')
    ) return;

    const tenantId = activeTenantId;
    const generation = loadGeneration;
    mutationState = 'loading';
    mutationMessage = '';
    mutationRequestId = '';
    try {
      if (manageTarget) {
        await backendClient.updateStaffMembership({
          tenantId,
          membershipId: manageTarget.membershipId,
          role: selectedRole,
          status: selectedStatus,
          auditReason: auditReason.trim(),
          idempotencyKey: mutationKey,
        });
        mutationMessage = 'Staff membership access updated.';
      } else if (revokeTarget) {
        await backendClient.revokeAdminInvite({
          tenantId,
          inviteId: revokeTarget.id,
          auditReason: auditReason.trim(),
          idempotencyKey: mutationKey,
        });
        mutationMessage = 'Pending invitation revoked.';
      } else {
        return;
      }
      if (tenantId !== activeTenantId || generation !== loadGeneration) return;
      closeLifecycleDialog(true);
      await loadStaffDirectory(tenantId);
    } catch (error) {
      if (tenantId !== activeTenantId || generation !== loadGeneration) return;
      mutationState = 'error';
      mutationRequestId =
        error instanceof BackendApiError ? error.requestId || '' : '';
      mutationMessage = error instanceof BackendApiError && error.status === 403
        ? 'Only organization owners can change staff access.'
        : 'Staff access could not be changed.';
    }
  }
</script>

{#if showModal}
  <InviteStaffModal
    on:success={() => {
      showModal = false;
      if (activeTenantId) void loadStaffDirectory(activeTenantId);
    }}
    on:cancel={() => { showModal = false; }}
  />
{/if}

{#if manageTarget || revokeTarget}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="staff-lifecycle-title">
    <div class="flex min-h-full items-center justify-center p-4">
      <button
        type="button"
        class="fixed inset-0 z-0 h-full w-full bg-slate-950/70"
        aria-label="Close staff access dialog"
        tabindex="-1"
        disabled={mutationState === 'loading'}
        on:click={() => closeLifecycleDialog()}
      ></button>
      <div
        class="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        tabindex="-1"
        use:modalFocus={{ onEscape: () => closeLifecycleDialog(), initialFocusSelector: '[data-staff-cancel]' }}
      >
        <h3 id="staff-lifecycle-title" class="text-lg font-semibold text-gray-900">
          {manageTarget ? 'Manage staff access' : 'Revoke pending invitation?'}
        </h3>
        {#if manageTarget}
          <p class="mt-2 text-sm text-gray-600">
            Update {manageTarget.displayName || manageTarget.email || 'this membership'}.
            The server protects the organization's last active owner.
          </p>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-medium text-gray-700">
              Role
              <select bind:value={selectedRole} disabled={mutationState === 'loading'} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <label class="text-sm font-medium text-gray-700">
              Membership status
              <select bind:value={selectedStatus} disabled={mutationState === 'loading'} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        {:else if revokeTarget}
          <p class="mt-2 text-sm text-gray-600">
            Revoke the pending invitation for {revokeTarget.email || 'this recipient'}.
            The invitation will no longer be redeemable.
          </p>
        {/if}
        <label class="mt-5 block text-sm font-medium text-gray-700">
          Audit reason
          <textarea
            bind:value={auditReason}
            rows="3"
            minlength="3"
            maxlength="500"
            disabled={mutationState === 'loading'}
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          ></textarea>
        </label>
        {#if mutationState === 'error'}
          <div class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <p>{mutationMessage}</p>
            {#if mutationRequestId}<p class="mt-1 text-xs">Support request: {mutationRequestId}</p>{/if}
          </div>
        {/if}
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-staff-cancel
            disabled={mutationState === 'loading'}
            class="rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
            on:click={() => closeLifecycleDialog()}
          >Cancel</button>
          <button
            type="button"
            disabled={mutationState === 'loading'
              || auditReason.trim().length < 3
              || Boolean(
                manageTarget
                && selectedRole === manageTarget.role
                && selectedStatus === (manageTarget.active ? 'active' : 'inactive')
              )}
            class="crm-ui-danger-button"
            on:click={confirmLifecycleChange}
          >{mutationState === 'loading'
            ? 'Saving…'
            : mutationState === 'error'
              ? 'Retry change'
              : manageTarget
                ? 'Save access change'
                : 'Revoke invitation'}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="flex h-full flex-col space-y-6 overflow-y-auto bg-white p-4 sm:p-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="crm-ui-page-title">Staff access</h2>
      <p class="text-sm text-gray-500">Review active organization memberships and pending invitations.</p>
    </div>
    <button type="button" on:click={() => showModal = true} class="rounded-md bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-medium text-[var(--crm-on-primary)] shadow-sm hover:bg-[var(--crm-brand-primary-hover)]">
      Invite staff
    </button>
  </div>
  {#if mutationMessage && !manageTarget && !revokeTarget}
    <p class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">
      {mutationMessage}
    </p>
  {/if}

  <div class="border-b border-gray-200">
    <nav class="-mb-px flex gap-8" aria-label="Staff views">
      <button type="button" class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'Directory' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500'}" aria-current={activeTab === 'Directory' ? 'page' : undefined} on:click={() => activeTab = 'Directory'}>Staff directory</button>
      <button type="button" class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'Invites' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500'}" aria-current={activeTab === 'Invites' ? 'page' : undefined} on:click={() => activeTab = 'Invites'}>Pending invites</button>
    </nav>
  </div>

  <div class="flex flex-col gap-4 sm:flex-row">
    <label class="flex-1">
      <span class="sr-only">Search staff by name or email</span>
      <input type="search" bind:value={searchQuery} class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Search staff by name or email" />
    </label>
    <label>
      <span class="sr-only">Filter staff role</span>
      <select bind:value={roleFilter} class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">
        <option value="">All roles</option>
        {#if activeTab === 'Directory'}<option value="owner">Owner</option>{/if}
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
    </label>
  </div>

  {#if activeListTruncated}
    <p class="crm-ui-notice-card" role="status">
      Showing the first {STAFF_LIMIT} {activeTab === 'Directory' ? 'memberships' : 'pending invites'}. More records exist.
    </p>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="overflow-x-auto rounded-md border border-gray-200 shadow-sm" role="region" tabindex="0" aria-label={activeTab === 'Directory' ? 'Scrollable staff directory table' : 'Scrollable pending invitations table'}>
    <table class="crm-ui-table">
      <thead class="bg-gray-50">
        <tr>
          <th scope="col" class="crm-ui-th-wide">Name</th>
          <th scope="col" class="crm-ui-th-wide">Role</th>
          <th scope="col" class="crm-ui-th-wide">Status</th>
          <th scope="col" class="crm-ui-th-wide">Date</th>
          <th scope="col" class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-900">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200 bg-white">
        {#if isLoading}
          <tr><td colspan="5" class="px-6 py-12 text-center text-gray-500"><div role="status">Loading staff access…</div></td></tr>
        {:else if loadError}
          <tr>
            <td colspan="5" class="px-6 py-12 text-center">
              <div role="alert">
              <p class="text-sm text-red-700">{loadError}</p>
              {#if requestId}<p class="mt-1 text-xs text-red-700">Support request: {requestId}</p>{/if}
              <button type="button" class="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm" on:click={() => activeTenantId && loadStaffDirectory(activeTenantId)}>Try again</button>
              </div>
            </td>
          </tr>
        {:else if activeRows.length === 0}
          <tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">
            {#if normalizedSearch || roleFilter}
              No {activeTab === 'Directory' ? 'memberships' : 'pending invites'} match the current filters.
            {:else}
              No {activeTab === 'Directory' ? 'active staff memberships' : 'pending staff invitations'} are available.
            {/if}
          </td></tr>
        {:else if activeTab === 'Directory'}
          {#each staffRows as staff (staff.membershipId)}
            <tr>
              <td class="px-6 py-4">
                <p class="text-sm font-medium text-gray-900">{staff.displayName || 'Name unavailable'}</p>
                <p class="crm-ui-hint-xs">{staff.email || 'Email unavailable'}</p>
              </td>
              <td class="px-6 py-4 text-sm capitalize text-gray-700">{staff.role}</td>
              <td class="px-6 py-4 text-sm text-gray-700">{staff.active ? 'Active membership' : 'Inactive membership'}{staff.emailVerified ? ' · verified email' : ' · email unverified'}</td>
              <td class="px-6 py-4 text-sm text-gray-500">{formatDate(staff.joinedAt)}</td>
              <td class="px-6 py-4 text-right">
                <button type="button" class="crm-theme-link text-sm font-medium" on:click={() => openManageDialog(staff)}>Manage access</button>
              </td>
            </tr>
          {/each}
        {:else}
          {#each inviteRows as invite (invite.id)}
            <tr>
              <td class="px-6 py-4">
                <p class="text-sm font-medium text-gray-900">{invite.displayName || 'Name unavailable'}</p>
                <p class="crm-ui-hint-xs">{invite.email || 'Email unavailable'}</p>
              </td>
              <td class="px-6 py-4 text-sm capitalize text-gray-700">{invite.role}</td>
              <td class="px-6 py-4 text-sm text-amber-700">Pending invitation</td>
              <td class="px-6 py-4 text-sm text-gray-500">Sent {formatDate(invite.createdAt)} · expires {formatDate(invite.expiresAt)}</td>
              <td class="px-6 py-4 text-right">
                <button type="button" class="text-sm font-medium text-red-700 hover:text-red-900" on:click={() => openRevokeDialog(invite)}>Revoke</button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
