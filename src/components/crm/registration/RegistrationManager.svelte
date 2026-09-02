<script lang="ts">
  import { onMount } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { RegistrationService } from '../../../lib/services/RegistrationService';
  import FormsTable from './FormsTable.svelte';
  import RegistrationDetail from './RegistrationDetail.svelte';
  import CreateRegistrationForm from './CreateRegistrationForm.svelte';
  import { downloadCsv } from '../../../lib/ui/csvExport';

  let forms: any[] = [];
  let participants: any[] = [];
  let connectedEvents: any[] = [];
  let isLoadingForms = true;
  let isLoadingParticipants = false;
  let formsError = '';
  let detailError = '';
  let participantsTruncated = false;
  let participantCount: number | null = null;
  let eventsTruncated = false;
  let eventCount: number | null = null;
  let detailGeneration = 0;
  let formsSubscriptionGeneration = 0;
  let activeTenantId = '';

  let activeTab: 'Active' | 'Retired' | 'Needs Review' = 'Active';
  let searchQuery = '';

  let selectedFormId: any = null;
  let selectedForm: any = null;

  let isCreateFormOpen = false;
  let editingForm: any = null;

  let unsubscribeForms = () => {};

  function handleFormsError(
    error: unknown,
    tenantId: string,
    generation: number,
  ) {
    if (
      activeTenantId !== tenantId
      || formsSubscriptionGeneration !== generation
    ) return;
    console.error('Registration forms could not be loaded.');
    formsError = String((error as { code?: unknown })?.code || '').includes('permission-denied')
      ? 'You do not have permission to view registration forms.'
      : 'Registration forms could not be loaded.';
    isLoadingForms = false;
  }

  function subscribeToActiveForms(tenantId: string) {
    unsubscribeForms();
    unsubscribeForms = () => {};
    const generation = ++formsSubscriptionGeneration;
    forms = [];
    formsError = '';
    isLoadingForms = true;
    try {
      unsubscribeForms = RegistrationService.subscribeToForms(
        tenantId,
        (newForms) => {
          if (
            activeTenantId !== tenantId
            || formsSubscriptionGeneration !== generation
          ) return;
          forms = newForms;
          formsError = '';
          if (selectedFormId) {
            selectedForm = newForms.find((form) => form.id === selectedFormId) || null;
            if (!selectedForm) goBackToOverview();
          }
          isLoadingForms = false;
        },
        (error) => handleFormsError(error, tenantId, generation),
      );
    } catch (error) {
      handleFormsError(error, tenantId, generation);
    }
  }

  function retryForms() {
    if (!activeTenantId || isLoadingForms) return;
    subscribeToActiveForms(activeTenantId);
  }

  onMount(() => {
    const unsubStore = tenantIdStore.subscribe((tenantId) => {
      unsubscribeForms(); // clear previous listener
      unsubscribeForms = () => {};
      formsSubscriptionGeneration += 1;
      activeTenantId = tenantId || '';
      detailGeneration += 1;
      forms = [];
      participants = [];
      connectedEvents = [];
      selectedFormId = null;
      selectedForm = null;
      editingForm = null;
      isCreateFormOpen = false;
      formsError = '';
      detailError = '';
      participantsTruncated = false;
      participantCount = null;
      eventsTruncated = false;
      eventCount = null;
      isLoadingParticipants = false;
      activeTab = 'Active';
      searchQuery = '';

      if (tenantId) {
        subscribeToActiveForms(tenantId);
      } else {
        isLoadingForms = false;
      }
    });

    return () => {
      unsubStore();
      unsubscribeForms();
      formsSubscriptionGeneration += 1;
      detailGeneration += 1;
    };
  });

  async function handleFormSelect(event) {
    const form = event.detail;
    if (!form || typeof form.id !== 'string' || !form.id) return;
    await loadFormDetail(form);
  }

  async function loadFormDetail(form) {
    const tenantId = $tenantIdStore;
    if (!tenantId || tenantId !== activeTenantId) return;
    const generation = ++detailGeneration;
    selectedFormId = form.id;
    selectedForm = form;
    isLoadingParticipants = true;
    participants = [];
    connectedEvents = [];
    detailError = '';
    participantsTruncated = false;
    eventsTruncated = false;
    try {
      const detailPage =
        await RegistrationService.fetchRegistrationDetailPage(tenantId, form.id);
      if (
        generation !== detailGeneration
        || tenantId !== activeTenantId
        || selectedFormId !== form.id
      ) return;
      participants = detailPage.participants.records;
      connectedEvents = detailPage.events.records;
      participantsTruncated = detailPage.participants.truncated;
      participantCount = detailPage.participants.exactCount;
      eventsTruncated = detailPage.events.truncated;
      eventCount = detailPage.events.records.length;
    } catch (error) {
      if (
        generation !== detailGeneration
        || tenantId !== activeTenantId
        || selectedFormId !== form.id
      ) return;
      console.error('Registration detail could not be loaded.');
      detailError = String((error as { code?: unknown })?.code || '').includes('permission-denied')
        ? 'You do not have permission to view this registration detail.'
        : 'Registration participants and connected events could not be loaded.';
    } finally {
      if (generation === detailGeneration && tenantId === activeTenantId) {
        isLoadingParticipants = false;
      }
    }
  }

  function retryFormDetail() {
    if (!selectedForm || isLoadingParticipants) return;
    void loadFormDetail(selectedForm);
  }

  function goBackToOverview() {
    detailGeneration += 1;
    selectedFormId = null;
    selectedForm = null;
    participants = [];
    connectedEvents = [];
    detailError = '';
    participantsTruncated = false;
    participantCount = null;
    eventsTruncated = false;
    eventCount = null;
    isLoadingParticipants = false;
  }

  function openNewRegistrationForm() {
    editingForm = null;
    isCreateFormOpen = true;
  }

  function openRegistrationFormEditor() {
    if (!selectedForm) return;
    editingForm = selectedForm;
    isCreateFormOpen = true;
  }

  function handleFormSaveSuccess(event) {
    const wasEditing = Boolean(editingForm?.id);
    if (wasEditing && selectedFormId === editingForm.id) {
      const saved = event.detail || {};
      selectedForm = {
        ...selectedForm,
        ...saved,
        name: saved.title || selectedForm.name,
        rawStatus: saved.status || selectedForm.rawStatus,
        status: saved.status === 'archived' ? 'Closed' : 'Open',
      };
    }
    isCreateFormOpen = false;
    editingForm = null;
    if (!wasEditing) goBackToOverview();
  }

  function handleLifecycleChange(event) {
    const updated = event.detail || {};
    selectedForm = { ...selectedForm, ...updated };
    forms = forms.map((form) => form.id === updated.id
      ? { ...form, ...updated }
      : form);
  }

  $: filteredForms = forms.filter(f => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (f.name && f.name.toLowerCase().includes(q)) ||
           (f.program && f.program.toLowerCase().includes(q));
  });
  $: visibleForms = filteredForms.filter((form) =>
    activeTab === 'Active'
      ? form.status === 'Open'
      : activeTab === 'Retired'
        ? form.status === 'Closed'
        : form.status !== 'Open' && form.status !== 'Closed',
  );
  $: lifecycleCounts = {
    Active: forms.filter((form) => ['active', 'open'].includes(String(form.rawStatus || form.status || '').toLowerCase())).length,
    Retired: forms.filter((form) => ['archived', 'closed'].includes(String(form.rawStatus || form.status || '').toLowerCase())).length,
    'Needs Review': forms.filter((form) => !['active', 'open', 'archived', 'closed'].includes(String(form.rawStatus || form.status || '').toLowerCase())).length,
  };

  function exportVisibleForms() {
    downloadCsv(
      visibleForms.map((form) => ({
        id: form.id,
        name: form.name || form.title || '',
        status: form.status || '',
        program: form.program || 'Unavailable',
        createdAt:
          form.dateCreated instanceof Date
            ? form.dateCreated.toISOString()
            : form.createdAt instanceof Date
              ? form.createdAt.toISOString()
              : 'Unavailable',
      })),
      [
        { key: 'id', label: 'Form ID' },
        { key: 'name', label: 'Name' },
        { key: 'status', label: 'Status' },
        { key: 'program', label: 'Program' },
        { key: 'createdAt', label: 'Created At' },
      ],
      `registration-forms-${activeTab}`,
    );
  }
</script>

{#if isCreateFormOpen}
  <CreateRegistrationForm
    form={editingForm}
    on:success={handleFormSaveSuccess}
    on:cancel={() => {
      isCreateFormOpen = false;
      editingForm = null;
    }}
  />
{/if}

<div class="h-full flex flex-col p-8 space-y-6 overflow-y-auto bg-white">
  {#if !selectedFormId}
    <!-- Overview Dashboard -->
    <header class="mb-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 class="crm-ui-page-title">Registration forms</h2>
        <p class="mt-1 text-sm text-gray-500">Create enrollment experiences, review responses, and retire forms you no longer use.</p>
      </div>
      <button on:click={openNewRegistrationForm} class="flex shrink-0 items-center rounded bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-semibold text-[var(--crm-on-primary)] shadow-sm hover:bg-[var(--crm-brand-primary-hover)]">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        Create New Registration Form
      </button>
    </header>

    <!-- Tabs -->
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-8">
        <button
          aria-label="Active"
          class="crm-ui-registration-tab {activeTab === 'Active' ? 'crm-ui-registration-tab-active' : 'crm-ui-registration-tab-idle'}"
          on:click={() => activeTab = 'Active'}
        >
          Active ({lifecycleCounts.Active})
        </button>
        <button
          aria-label="Retired"
          class="crm-ui-registration-tab {activeTab === 'Retired' ? 'crm-ui-registration-tab-active' : 'crm-ui-registration-tab-idle'}"
          on:click={() => activeTab = 'Retired'}
        >
          Retired ({lifecycleCounts.Retired})
        </button>
        <button
          aria-label="Needs Review"
          class="crm-ui-registration-tab {activeTab === 'Needs Review' ? 'crm-ui-registration-tab-active' : 'crm-ui-registration-tab-idle'}"
          on:click={() => activeTab = 'Needs Review'}
        >
          Needs Review ({lifecycleCounts['Needs Review']})
        </button>
      </nav>
      {#if activeTab === 'Needs Review'}<p class="py-3 text-sm text-amber-800">Needs Review contains legacy or unsupported lifecycle records that must be checked before editing or publishing.</p>{/if}
    </div>

    <!-- Toolbar -->
    <section class="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:flex-row" aria-label="Registration form list tools">
      <div class="relative flex-1">
        <div class="crm-ui-search-icon">
          <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
        <label>
          <span class="sr-only">Search registration forms</span>
          <input
          type="search"
          bind:value={searchQuery}
          class="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--crm-brand-border)]"
          placeholder="Search forms by name or program"
          />
        </label>
      </div>
      <button
        type="button"
        on:click={exportVisibleForms}
        disabled={visibleForms.length === 0}
        title={visibleForms.length === 0 ? 'There are no forms in this view to export.' : undefined}
        class="crm-ui-registration-export"
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
        Export
      </button>
    </section>

    <FormsTable
      forms={filteredForms}
      {isLoadingForms}
      {activeTab}
      error={formsError}
      on:select={handleFormSelect}
    />
    {#if formsError}
      <div>
        <button
          type="button"
          on:click={retryForms}
          disabled={isLoadingForms || !activeTenantId}
          class="crm-ui-registration-retry"
        >
          Retry loading forms
        </button>
      </div>
    {/if}

  {:else}
    <RegistrationDetail
      {selectedForm}
      {participants}
      {connectedEvents}
      {isLoadingParticipants}
      error={detailError}
      {participantsTruncated}
      {eventsTruncated}
      {participantCount}
      {eventCount}
      tenantId={activeTenantId}
      on:back={goBackToOverview}
      on:edit={openRegistrationFormEditor}
      on:lifecycle={handleLifecycleChange}
      on:retry={retryFormDetail}
    />
  {/if}
</div>
