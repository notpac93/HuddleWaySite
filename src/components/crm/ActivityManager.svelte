<script lang="ts">
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError, type CrmAuditEventRecord } from '../../lib/api/BackendApi';
  import { downloadCsv } from '../../lib/ui/csvExport';
  import { modalFocus } from '../../lib/ui/modalFocus';

  let activities: CrmAuditEventRecord[] = [];
  let isLoading = false;
  let isLoadingMore = false;
  let errorMessage = '';
  let loadMoreError = '';
  let loadedTenantId = '';
  let truncated = false;
  let requestId = '';
  let loadGeneration = 0;
  let hasMore = false;
  let nextCursor: string | null = null;
  let searchQuery = '';
  let actorFilter = '';
  let actionFilter = '';
  let resourceFilter = '';
  let outcomeFilter = '';
  let dateFrom = '';
  let dateTo = '';
  let selectedActivity: CrmAuditEventRecord | null = null;
  let lastRefreshedAt: Date | null = null;

  async function loadActivities(append = false) {
    const tenantId = $tenantIdStore;
    const generation = ++loadGeneration;
    if (!tenantId) {
      activities = [];
      errorMessage = '';
      requestId = '';
      truncated = false;
      hasMore = false;
      nextCursor = null;
      isLoading = false;
      isLoadingMore = false;
      return;
    }
    if (append) {
      if (!hasMore || !nextCursor || isLoadingMore) return;
      isLoadingMore = true;
      loadMoreError = '';
    } else {
      isLoading = true;
      isLoadingMore = false;
      errorMessage = '';
      loadMoreError = '';
      activities = [];
      hasMore = false;
      nextCursor = null;
    }
    requestId = '';
    try {
      const page = await backendClient.auditEventPage(
        tenantId,
        50,
        append ? nextCursor || undefined : undefined,
      );
      if (generation !== loadGeneration || $tenantIdStore !== tenantId) return;
      const nextEvents = append ? [...activities, ...page.events] : page.events;
      const seen = new Set<string>();
      activities = nextEvents.filter((activity) => {
        if (!activity.id || seen.has(activity.id)) return false;
        seen.add(activity.id);
        return true;
      });
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;
      truncated = page.hasMore;
      requestId = page.requestId;
      lastRefreshedAt = new Date();
    } catch (e) {
      console.error('Activity could not be loaded.');
      if (generation !== loadGeneration || $tenantIdStore !== tenantId) return;
      if (e instanceof BackendApiError) requestId = e.requestId || '';
      const message =
        e instanceof BackendApiError && e.status === 403
          ? 'You do not have permission to view organization activity.'
          : e instanceof BackendApiError
            ? e.message
            : 'Activity could not be loaded. Check your connection and try again.';
      if (append) loadMoreError = message;
      else errorMessage = message;
    } finally {
      if (generation === loadGeneration && $tenantIdStore === tenantId) {
        if (append) isLoadingMore = false;
        else isLoading = false;
      }
    }
  }

  function refreshActivities() {
    void loadActivities(false);
  }

  $: if ($tenantIdStore !== loadedTenantId) {
    loadGeneration += 1;
    loadedTenantId = $tenantIdStore || '';
    activities = [];
    errorMessage = '';
    requestId = '';
    truncated = false;
    hasMore = false;
    nextCursor = null;
    loadMoreError = '';
    void loadActivities(false);
  }

  function formatTime(isoString: string | null) {
    if (!isoString) return 'Timestamp unavailable';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Timestamp unavailable';
    return date.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function getActionIcon(actionType: string) {
    switch (actionType) {
      case 'create':
        return 'bg-green-100 text-green-600';
      case 'update':
        return 'bg-blue-100 text-blue-600';
      case 'delete':
        return 'bg-red-100 text-red-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  }

  function activityObjectLabel(activity: CrmAuditEventRecord) {
    const details = activity.after || activity.before || {};
    const displayName = String(details.displayName || '').trim();
    const email = String(details.email || '').trim();
    if (displayName && email) return `${displayName} · ${email}`;
    if (displayName || email) return displayName || email;
    return `${activity.resourceType} · ${activity.resourceId || 'ID unavailable'}`;
  }

  $: actors = [...new Set(activities.map((activity) => activity.actorLabel).filter(Boolean))].sort();
  $: resources = [...new Set(activities.map((activity) => activity.resourceType).filter(Boolean))].sort();
  $: filteredActivities = activities.filter((activity) => {
    const query = searchQuery.trim().toLowerCase();
    const day = activity.timestamp?.slice(0, 10) || '';
    return (!query || [activity.actionDescription, activity.actorLabel, activity.resourceType, activity.resourceId, activity.reason, activity.correlationId]
      .some((value) => String(value || '').toLowerCase().includes(query)))
      && (!actorFilter || activity.actorLabel === actorFilter)
      && (!actionFilter || activity.actionType === actionFilter)
      && (!resourceFilter || activity.resourceType === resourceFilter)
      && (!outcomeFilter || activity.outcome === outcomeFilter)
      && (!dateFrom || day >= dateFrom)
      && (!dateTo || day <= dateTo);
  });

  function exportActivity() {
    downloadCsv(filteredActivities.map((activity) => ({
      organization: $tenantIdStore || '', generatedAt: new Date().toISOString(),
      filters: `actor=${actorFilter || 'all'}; action=${actionFilter || 'all'}; resource=${resourceFilter || 'all'}; outcome=${outcomeFilter || 'all'}; from=${dateFrom || 'any'}; to=${dateTo || 'any'}`,
      timestamp: activity.timestamp, actor: activity.actorLabel, role: activity.actorRole,
      action: activity.action, resourceType: activity.resourceType, resourceId: activity.resourceId,
      outcome: activity.outcome, reason: activity.reason, correlationId: activity.correlationId,
      retentionCaveat: 'Export includes only audit records retained and loaded in the portal.',
    })), [
      { key: 'organization', label: 'Organization' }, { key: 'generatedAt', label: 'Generated at' },
      { key: 'filters', label: 'Filters' }, { key: 'timestamp', label: 'Timestamp' },
      { key: 'actor', label: 'Actor' }, { key: 'role', label: 'Role' },
      { key: 'action', label: 'Action' }, { key: 'resourceType', label: 'Object type' },
      { key: 'resourceId', label: 'Object ID' }, { key: 'outcome', label: 'Outcome' },
      { key: 'reason', label: 'Reason' }, { key: 'correlationId', label: 'Correlation ID' },
      { key: 'retentionCaveat', label: 'Retention caveat' },
    ], `huddleway-activity-${$tenantIdStore || 'organization'}`);
  }
</script>

{#if selectedActivity}
  <div class="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
    <button type="button" class="absolute inset-0" aria-label="Close activity details" on:click={() => selectedActivity = null}></button>
    <aside class="relative z-10 h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" tabindex="-1" use:modalFocus={{ onEscape: () => selectedActivity = null, initialFocusSelector: 'button' }}>
      <div class="flex justify-between gap-4"><div><h3 id="activity-detail-title" class="text-xl font-semibold">Audit record</h3><p class="text-sm text-gray-500">{selectedActivity.actionDescription}</p></div><button type="button" class="rounded-md border px-3 py-2 text-sm" on:click={() => selectedActivity = null}>Close</button></div>
      <dl class="mt-6 grid gap-4 text-sm sm:grid-cols-2"><div><dt class="text-gray-500">Actor</dt><dd>{selectedActivity.actorLabel} ({selectedActivity.actorRole}){#if selectedActivity.actorEmail && selectedActivity.actorEmail !== selectedActivity.actorLabel}<span class="block text-gray-600">{selectedActivity.actorEmail}</span>{/if}</dd></div><div><dt class="text-gray-500">Outcome</dt><dd>{selectedActivity.outcome}</dd></div><div><dt class="text-gray-500">Object</dt><dd>{activityObjectLabel(selectedActivity)}</dd></div><div><dt class="text-gray-500">Time</dt><dd>{formatTime(selectedActivity.timestamp)}</dd></div><div><dt class="text-gray-500">Source</dt><dd>{selectedActivity.source}</dd></div><div><dt class="text-gray-500">Correlation ID</dt><dd class="break-all">{selectedActivity.correlationId || 'Unavailable'}</dd></div></dl>
      <section class="mt-6"><h4 class="font-semibold">Reason</h4><p class="mt-1 text-sm">{selectedActivity.reason || 'No audit reason was recorded.'}</p></section>
      <div class="mt-6 grid gap-4 sm:grid-cols-2"><section class="rounded-md border bg-gray-50 p-4"><h4 class="font-semibold">Before</h4><pre class="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(selectedActivity.before, null, 2) || 'Not available'}</pre></section><section class="rounded-md border bg-gray-50 p-4"><h4 class="font-semibold">After</h4><pre class="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(selectedActivity.after, null, 2) || 'Not available'}</pre></section></div>
    </aside>
  </div>
{/if}

<div class="h-full bg-white flex flex-col">
  <div class="px-8 py-6 border-b border-gray-200 flex justify-between items-center">
    <div>
      <h2 class="crm-ui-page-title">Activity & Audit Logs</h2>
      <p class="mt-1 text-sm text-gray-500">A chronological record of actions taken in your organization.</p>
      <p class="mt-1 text-xs text-gray-500">Records are shown newest first for the retained server history. Last successful ingestion: {activities[0]?.timestamp ? formatTime(activities[0].timestamp) : 'not yet available'} · refreshed {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : 'not yet'}.</p>
    </div>
    <button
      type="button"
      on:click={refreshActivities}
      disabled={isLoading || isLoadingMore || !$tenantIdStore}
      class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--crm-brand-focus)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg class="-ml-1 mr-2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  </div>

  <div class="flex-1 p-8 overflow-y-auto bg-gray-50">
    <div class="max-w-4xl mx-auto">
      <section class="mb-5 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Activity filters">
        <label class="text-sm">Search<input type="search" class="mt-1 block w-full rounded-md border p-2" bind:value={searchQuery} placeholder="Action, object, ID, reason" /></label>
        <label class="text-sm">Actor<select class="mt-1 block w-full rounded-md border p-2" bind:value={actorFilter}><option value="">All actors</option>{#each actors as actor}<option value={actor}>{actor} — filter</option>{/each}</select></label>
        <label class="text-sm">Action<select class="mt-1 block w-full rounded-md border p-2" bind:value={actionFilter}><option value="">All actions</option><option value="create">Create</option><option value="update">Update</option><option value="delete">Delete</option></select></label>
        <label class="text-sm">Object type<select class="mt-1 block w-full rounded-md border p-2" bind:value={resourceFilter}><option value="">All objects</option>{#each resources as resource}<option value={resource}>{resource}</option>{/each}</select></label>
        <label class="text-sm">Outcome<select class="mt-1 block w-full rounded-md border p-2" bind:value={outcomeFilter}><option value="">Any outcome</option><option value="succeeded">Succeeded</option><option value="partial">Partial</option><option value="failed">Failed</option><option value="denied">Denied</option></select></label>
        <label class="text-sm">From<input type="date" class="mt-1 block w-full rounded-md border p-2" bind:value={dateFrom} /></label><label class="text-sm">To<input type="date" class="mt-1 block w-full rounded-md border p-2" bind:value={dateTo} /></label>
        <button type="button" class="self-end rounded-md border px-3 py-2 text-sm" disabled={filteredActivities.length === 0} on:click={exportActivity}>Export filtered CSV</button>
      </section>
      {#if isLoading}
        <div class="flex justify-center items-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--crm-brand-primary)]" role="status" aria-label="Loading activity"></div>
        </div>
      {:else if errorMessage}
        <div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center" role="alert">
          <h3 class="text-sm font-semibold text-red-900">Activity could not be loaded</h3>
          <p class="mt-1 text-sm text-red-800">{errorMessage}</p>
          <button
            type="button"
            on:click={() => loadActivities(false)}
            class="mt-4 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      {:else if activities.length === 0}
        <div class="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No activity found</h3>
          <p class="mt-1 text-sm text-gray-500">No retained audit events were returned. Logging may have begun after this organization was created, or ingestion may require investigation.</p>
          {#if requestId}<p class="mt-2 text-xs text-gray-500">Diagnostic reference: {requestId}</p>{/if}
        </div>
      {:else}
        {#if truncated}
          <p class="crm-ui-notice" role="status">
            Showing {activities.length} loaded audit events. More records exist; this is not the full history.
          </p>
        {/if}
        {#if filteredActivities.length === 0}
          <div class="rounded-lg border bg-white p-8 text-center text-sm text-gray-600">No loaded audit events match these filters. Clear one or more filters or load older activity.</div>
        {:else}<div class="flow-root">
          <ul class="-mb-8">
            {#each filteredActivities as activity, idx (activity.id)}
              <li>
                <div class="relative pb-8">
                  {#if idx !== activities.length - 1}
                    <span class="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                  {/if}
                  <div class="relative flex space-x-3">
                    <div>
                      <span class="h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-gray-50 {getActionIcon(activity.actionType)}">
                        <!-- Icon based on actionType -->
                        {#if activity.actionType === 'create'}
                          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                          </svg>
                        {:else if activity.actionType === 'update'}
                          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        {:else if activity.actionType === 'delete'}
                          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        {:else}
                          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        {/if}
                      </span>
                    </div>
                    <button type="button" class="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4 text-left" on:click={() => selectedActivity = activity}>
                      <div>
                        <p class="text-sm text-gray-500">
                          <span class="font-medium text-gray-900">{activity.actorLabel || 'Actor unavailable'}</span>
                          {activity.actionDescription || 'performed an action'}
                          <span class="text-gray-600"> · {activityObjectLabel(activity)}</span>
                          {#if activity.outcome !== 'succeeded'}
                            <span class="ml-1 font-medium text-amber-700">({activity.outcome})</span>
                          {/if}
                        </p>
                      </div>
                      <div class="text-right text-sm whitespace-nowrap text-gray-500">
                        {#if activity.timestamp}
                          <time datetime={activity.timestamp}>{formatTime(activity.timestamp)}</time>
                        {:else}
                          <span>Timestamp unavailable</span>
                        {/if}
                      </div>
                    </button>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </div>{/if}
        {#if loadMoreError}
          <div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <p>{loadMoreError}</p>
          </div>
        {/if}
        {#if hasMore}
          <div class="mt-6 flex justify-center">
            <button
              type="button"
              disabled={isLoadingMore || !nextCursor}
              class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              on:click={() => loadActivities(true)}
            >{isLoadingMore ? 'Loading more…' : loadMoreError ? 'Retry loading more' : 'Load more activity'}</button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
