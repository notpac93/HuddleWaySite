<script lang="ts">
  import RecordToolbar from './ui/RecordToolbar.svelte';
  import RecordItem from './ui/RecordItem.svelte';
  import { registerLiveRefresh } from '../../lib/crm/liveRefresh';
  import { onMount as mountRefresh } from 'svelte';
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

  export let onNavigateTab: (tab: string) => void = () => {};

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
  let statusFilter = '';
  let verificationFilter = '';
  let sortBy: 'name' | 'role' | 'date' = 'name';
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
  let inviteActionId = '';

  $: normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  $: staffRows = (directory?.staff || []).filter((staff) => {
    if (roleFilter && staff.role !== roleFilter) return false;
    if (statusFilter && staff.status !== statusFilter) return false;
    if (verificationFilter && (verificationFilter === 'verified') !== staff.emailVerified) return false;
    if (!normalizedSearch) return true;
    return [staff.displayName, staff.email, staff.uid]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
  }).sort((left, right) => sortBy === 'role'
    ? left.role.localeCompare(right.role)
    : sortBy === 'date'
      ? String(right.joinedAt || '').localeCompare(String(left.joinedAt || ''))
      : String(left.displayName || left.email || '').localeCompare(String(right.displayName || right.email || '')));
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

  async function loadStaffDirectory(tenantId: string, silent = false) {
    const generation = ++loadGeneration;
    if (!tenantId) {
      directory = null;
      isLoading = false;
      return;
    }
    if (!silent) isLoading = true;
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
      statusFilter = '';
      verificationFilter = '';
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

  async function resendInvite(invite: AdminStaffDirectory['pendingInvites'][number]) {
    if (!activeTenantId || inviteActionId) return;
    inviteActionId = invite.id;
    mutationMessage = '';
    try {
      await backendClient.resendAdminInvite({
        tenantId: activeTenantId,
        inviteId: invite.id,
        idempotencyKey: createIdempotencyKey(`invite-resend-${invite.id}`),
      });
      mutationMessage = `Invitation resent to ${invite.email}. Its original expiration is unchanged.`;
      await loadStaffDirectory(activeTenantId);
    } catch (error) {
      mutationMessage = error instanceof BackendApiError ? error.message : 'The invitation could not be resent.';
    } finally {
      inviteActionId = '';
    }
  }

  async function copyInviteLink(invite: AdminStaffDirectory['pendingInvites'][number]) {
    try {
      await navigator.clipboard.writeText(new URL(`/invite/${encodeURIComponent(invite.id)}`, window.location.origin).toString());
      mutationMessage = `Invite link copied for ${invite.email}. It expires ${formatDate(invite.expiresAt)} and only the invited address can accept it.`;
    } catch {
      mutationMessage = 'The browser could not copy the invitation link.';
    }
  }

  mountRefresh(() => registerLiveRefresh(() => activeTenantId && !isLoading && !showModal && !manageTarget && !revokeTarget ? loadStaffDirectory(activeTenantId, true) : undefined));
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
          <section class="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950" aria-label="Access change impact">
            <p><strong>Before:</strong> {manageTarget.role}, {manageTarget.active ? 'active' : 'inactive'}.</p>
            <p><strong>After:</strong> {selectedRole}, {selectedStatus}.</p>
            {#if selectedRole === manageTarget.role && selectedStatus === (manageTarget.active ? 'active' : 'inactive')}
              <p class="mt-2">No access change is currently selected.</p>
            {:else if selectedStatus === 'inactive'}
              <p class="mt-2">This removes portal access after authorization refresh; authored program content remains attributed and intact. Reactivation is available later.</p>
            {:else if selectedRole === 'owner'}
              <p class="mt-2">Gains every portal tab plus financial, staff-access, and audit-log management.</p>
            {:else if selectedRole === 'editor'}
              <p class="mt-2">Can change teams, seasons, rosters, events, registration, messages, documents, media, and My App. Cannot access Financials, Staff, or Activity.</p>
            {:else}
              <p class="mt-2">Retains read-only Dashboard access and loses record-changing actions.</p>
            {/if}
          </section>
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
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 class="crm-ui-page-title">Staff access</h2>
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

  <RecordToolbar activeCount={[searchQuery.trim(), roleFilter, statusFilter, verificationFilter].filter(Boolean).length}>
    <select slot="view" aria-label="Staff view" bind:value={activeTab}>
      <option value="Directory">Staff directory</option><option value="Invites">Pending invites</option>
    </select>
  <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
    <label class="flex-1">
      <span class="sr-only">Search staff by name or email</span>
      <input type="search" bind:value={searchQuery} class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Search staff by name or email" />
    </label>
    {#if activeTab === 'Directory'}
      <label><span class="sr-only">Filter staff status</span><select bind:value={statusFilter} class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label><span class="sr-only">Filter email verification</span><select bind:value={verificationFilter} class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm"><option value="">Any verification</option><option value="verified">Verified email</option><option value="unverified">Unverified email</option></select></label>
      <label><span class="sr-only">Sort staff</span><select bind:value={sortBy} class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm"><option value="name">Sort by name</option><option value="role">Sort by role</option><option value="date">Sort by newest</option></select></label>
    {/if}
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
  </RecordToolbar>

  {#if activeListTruncated}
    <p class="crm-ui-notice-card" role="status">
      Showing the first {STAFF_LIMIT} {activeTab === 'Directory' ? 'memberships' : 'pending invites'}. More records exist.
    </p>
  {/if}

  <div class="rounded-xl border border-gray-200 bg-white text-gray-900" aria-label={activeTab === 'Directory' ? 'Staff directory' : 'Pending invitations'}>
    {#if isLoading}
      <p class="p-6 text-center" role="status">Loading staff access…</p>
    {:else if loadError}
      <div class="p-6" role="alert"><p>{loadError}</p><button type="button" class="crm-ui-button-secondary mt-3" on:click={() => activeTenantId && loadStaffDirectory(activeTenantId)}>Try again</button></div>
    {:else if activeRows.length === 0}
      <p class="p-6 text-center">No {activeTab === 'Directory' ? 'staff' : 'pending invites'}{normalizedSearch || roleFilter || statusFilter || verificationFilter ? ' match the current filters.' : ' are available.'}</p>
    {:else if activeTab === 'Directory'}
      {#each staffRows as staff (staff.membershipId)}
        <RecordItem title={staff.displayName || 'Name unavailable'} context={staff.role.charAt(0).toUpperCase() + staff.role.slice(1)} status={staff.active ? 'Active' : 'Inactive'} date={formatDate(staff.joinedAt)}>
          <dl><dt>Email</dt><dd>{staff.email || 'Email unavailable'}</dd><dt>Verification</dt><dd>{staff.emailVerified ? 'Verified email' : 'Email unverified'}</dd><dt>Joined</dt><dd>{formatDate(staff.joinedAt)}</dd></dl>
          {#if !staff.displayName}<button type="button" class="crm-theme-link mr-3 text-sm" on:click={() => onNavigateTab('Settings')}>Complete profile in My profile</button>{/if}
          <button type="button" class="crm-theme-link text-sm font-semibold" on:click={() => openManageDialog(staff)}>Manage access</button>
        </RecordItem>
      {/each}
    {:else}
      {#each inviteRows as invite (invite.id)}
        <RecordItem title={invite.displayName || 'Name unavailable'} context={invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} status="Pending" date={formatDate(invite.createdAt)}>
          <dl><dt>Email</dt><dd>{invite.email || 'Email unavailable'}</dd><dt>Expires</dt><dd>{formatDate(invite.expiresAt)}</dd></dl>
          <div class="flex flex-wrap gap-4">
            <button type="button" class="crm-theme-link text-sm font-medium" disabled={Boolean(inviteActionId)} on:click={() => resendInvite(invite)}>{inviteActionId === invite.id ? 'Resending…' : 'Resend'}</button>
            <button type="button" class="crm-theme-link text-sm font-medium" disabled={Boolean(inviteActionId)} on:click={() => copyInviteLink(invite)}>Copy link</button>
            <button type="button" class="text-sm font-medium text-red-700" disabled={Boolean(inviteActionId)} on:click={() => openRevokeDialog(invite)}>Revoke</button>
          </div>
        </RecordItem>
      {/each}
    {/if}
  </div>
</div>
