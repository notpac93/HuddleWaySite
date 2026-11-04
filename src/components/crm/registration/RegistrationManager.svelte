<script lang="ts">
  import SectionEyebrow from '../ui/SectionEyebrow.svelte';
  import './registration.css';
  import SuccessToast from '../ui/SuccessToast.svelte';
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
  let formChangeReceipt = '';

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
      formChangeReceipt = '';
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
    formChangeReceipt = '';
    isCreateFormOpen = true;
  }

  function openRegistrationFormEditor() {
    if (!selectedForm) return;
    editingForm = selectedForm;
    formChangeReceipt = '';
    isCreateFormOpen = true;
  }

  function savedFormDisplayRecord(saved, previous: any = null) {
    const rawStatus = String(saved?.status || previous?.rawStatus || previous?.status || '')
      .toLowerCase();
    const title = saved?.title || saved?.name || previous?.name || 'Form name unavailable';
    return {
      ...previous,
      ...saved,
      title,
      name: title,
      rawStatus,
      status: ['archived', 'closed'].includes(rawStatus)
        ? 'Closed'
        : ['active', 'open'].includes(rawStatus)
          ? 'Open'
          : 'Status unavailable',
      dateCreated: previous?.dateCreated || null,
      program: saved?.teamId || previous?.program || 'Program-wide',
    };
  }

  function handleFormSaveSuccess(event) {
    const wasEditing = Boolean(editingForm?.id);
    const saved = event.detail || {};
    if (wasEditing) {
      const previous = forms.find((form) => form.id === editingForm.id) || editingForm;
      const updated = savedFormDisplayRecord(saved, previous);
      forms = forms.map((form) => form.id === updated.id ? updated : form);
      if (selectedFormId === updated.id) selectedForm = updated;
      formChangeReceipt = `Registration form “${updated.name}” updated.`;
    } else if (saved.id) {
      const created = savedFormDisplayRecord(saved);
      forms = [created, ...forms.filter((form) => form.id !== created.id)];
      formChangeReceipt = `Registration form “${created.name}” created.`;
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

<div class="crm-registration-workspace crm-auth-shell">
  <div class="crm-auth-watermark" aria-hidden="true"></div>
  {#if formChangeReceipt}
    {#key formChangeReceipt}
      <SuccessToast title={formChangeReceipt} onDismiss={() => formChangeReceipt = ''} />
    {/key}
  {/if}
  {#if !selectedFormId}
    <!-- Overview Dashboard -->
    <header class="crm-registration-header">
      <div>
        <SectionEyebrow label="Program registration" />
        <h2>Registration forms</h2>
      </div>
      <button on:click={openNewRegistrationForm} class="crm-auth-button-secondary">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        New form
      </button>
    </header>

    <!-- Tabs -->
    <div class="crm-registration-tabs">
      <nav class="-mb-px flex flex-wrap gap-x-5 gap-y-1">
        <button
          aria-label="Open"
          class="crm-registration-tab {activeTab === 'Active' ? 'crm-ui-registration-tab-active' : 'crm-ui-registration-tab-idle'}"
          on:click={() => activeTab = 'Active'}
        >
          Open ({lifecycleCounts.Active})
        </button>
        <button
          aria-label="Archived"
          class="crm-registration-tab {activeTab === 'Retired' ? 'crm-ui-registration-tab-active' : 'crm-ui-registration-tab-idle'}"
          on:click={() => activeTab = 'Retired'}
        >
          Archived ({lifecycleCounts.Retired})
        </button>
        {#if lifecycleCounts['Needs Review'] > 0 || activeTab === 'Needs Review'}
        <button
          aria-label="Needs Review"
          class="crm-registration-tab {activeTab === 'Needs Review' ? 'crm-ui-registration-tab-active' : 'crm-ui-registration-tab-idle'}"
          on:click={() => activeTab = 'Needs Review'}
        >
          Needs Review ({lifecycleCounts['Needs Review']})
        </button>
        {/if}
      </nav>
      {#if activeTab === 'Needs Review'}<p class="py-3 text-sm text-amber-800">These records must be checked before editing or publishing.</p>{/if}
    </div>

    <section class="crm-registration-panel" aria-label="Registration forms workspace">
    <!-- Toolbar -->

    <section class="flex flex-col gap-3 sm:flex-row" aria-label="Registration form list tools">
      <div class="relative flex-1">
        <div class="crm-ui-search-icon">
          <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
        <label>
          <span class="sr-only">Search registration forms</span>
          <input
          type="search"
          bind:value={searchQuery}
          class="crm-registration-search"
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

    </section>
  {:else}
    <section class="crm-registration-panel crm-registration-detail" aria-label="Registration form details">
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
    </section>
  {/if}
</div>
