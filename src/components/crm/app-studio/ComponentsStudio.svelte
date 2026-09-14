<script lang="ts">
  import { onDestroy } from 'svelte';
  import type {
    CrmAppConfiguration,
    CrmComponentDefinition,
    CrmComponentLayoutVersion,
    CrmComponentStudioPage,
    CrmComponentStudioSnapshot,
    CrmPageComponent,
  } from '../../../lib/api/BackendApi';
  import { backendClient } from '../../../lib/api/backendClient';
  import { createIdempotencyKey } from '../../../lib/api/BackendApi';
  import type { AppPreviewEnvironment } from '../../../lib/crm/appPreviewProtocol';
  import { clearPortalDraft, registerPortalDraft } from '../../../lib/ui/portalDraftGuard';
  import AppPreviewFrame from '../app/AppPreviewFrame.svelte';
  import ComponentEditor from './ComponentEditor.svelte';
  import ComponentLibrary from './ComponentLibrary.svelte';
  import ComponentLayoutHistory from './ComponentLayoutHistory.svelte';
  import ComponentOutline from './ComponentOutline.svelte';
  import ComponentPublishReview from './ComponentPublishReview.svelte';
  import {
    clonePages,
    componentChangeSummary,
    createComponent,
    pagesSignature,
    publishPayload,
    validatePages,
  } from './componentStudioDraft';

  export let tenantId: string;
  export let configuration: CrmAppConfiguration;
  export let configurationReady: boolean;
  export let previewOrigin: string | null;
  export let previewEnvironment: AppPreviewEnvironment;
  export let expectedSourceCommit = '';
  export let expectedReleaseId = '';

  let snapshot: CrmComponentStudioSnapshot | null = null;
  let pages: CrmComponentStudioPage[] = [];
  let selectedPageId = '';
  let selectedComponentId = '';
  let addingComponent: CrmPageComponent | null = null;
  let addingDefinition: CrmComponentDefinition | null = null;
  let libraryOpen = false;
  let selectedFieldId = '';
  let state: 'idle' | 'loading' | 'ready' | 'error' | 'publishing' = 'idle';
  let message = '';
  let loadSequence = 0;
  let activeTenantId = '';
  let loadedSignature = '';
  let componentEditor: ComponentEditor | null = null;
  let lastRemoval: { pageId: string; index: number; component: CrmPageComponent } | null = null;
  let showPublishReview = false;
  let historyOpen = false;

  $: selectedPage = pages.find((page) => page.id === selectedPageId) || pages[0];
  $: selectedComponent = addingComponent || selectedPage?.components.find(
    (component) => component.id === selectedComponentId,
  );
  $: selectedDefinition = addingDefinition || snapshot?.definitions.find(
    (definition) => definition.id === selectedComponent?.definitionId,
  );
  $: currentSignature = pagesSignature(pages);
  $: dirty = state !== 'loading' && Boolean(snapshot) && currentSignature !== loadedSignature;
  $: issues = snapshot ? validatePages(pages, snapshot.definitions) : [];
  $: publishChanges = snapshot ? componentChangeSummary(snapshot.pages, pages) : [];
  $: if (tenantId !== activeTenantId) {
    activeTenantId = tenantId;
    resetAndLoad(tenantId);
  }
  $: if (dirty && tenantId) {
    registerPortalDraft({
      id: 'my-app-components',
      title: 'Unpublished component changes',
      message: 'Stay on this page or discard the component changes before leaving.',
      retainLabel: 'Stay on page',
      onDiscard: discardChanges,
      onRetain: () => {},
    });
  } else {
    clearPortalDraft('my-app-components');
  }

  onDestroy(() => clearPortalDraft('my-app-components'));

  function resetAndLoad(nextTenantId: string) {
    loadSequence += 1;
    snapshot = null;
    pages = [];
    selectedPageId = '';
    selectedComponentId = '';
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
    message = '';
    lastRemoval = null;
    showPublishReview = false;
    historyOpen = false;
    state = nextTenantId ? 'loading' : 'idle';
    if (nextTenantId) void load(nextTenantId, loadSequence);
  }

  async function load(expectedTenantId: string, sequence: number, preserveMessage = false) {
    try {
      const result = await backendClient.componentStudio(expectedTenantId);
      if (sequence !== loadSequence || tenantId !== expectedTenantId) return;
      snapshot = result;
      pages = clonePages(result.pages);
      loadedSignature = pagesSignature(pages);
      lastRemoval = null;
      selectedPageId = pages.find((page) => page.route === '/')?.id || pages[0]?.id || '';
      selectedComponentId = pages.find((page) => page.id === selectedPageId)?.components[0]?.id || '';
      state = 'ready';
      if (!preserveMessage) message = '';
    } catch {
      if (sequence !== loadSequence || tenantId !== expectedTenantId) return;
      state = 'error';
      message = 'Components could not be loaded from the authoritative app layout.';
    }
  }

  function discardChanges() {
    if (!snapshot) return;
    const previouslySelectedComponentId = selectedComponentId;
    pages = clonePages(snapshot.pages);
    const restoredPage = pages.find((page) => page.id === selectedPageId) || pages[0];
    selectedPageId = restoredPage?.id || '';
    selectedComponentId = restoredPage?.components.some(
      (component) => component.id === previouslySelectedComponentId,
    )
      ? previouslySelectedComponentId
      : restoredPage?.components[0]?.id || '';
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
    message = 'Unpublished component changes were discarded.';
    lastRemoval = null;
    showPublishReview = false;
    historyOpen = false;
  }

  function selectPage(pageId: string) {
    selectedPageId = pageId;
    selectedComponentId = pages.find((page) => page.id === pageId)?.components[0]?.id || '';
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
  }

  function selectComponent(component: CrmPageComponent) {
    selectedComponentId = component.id;
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
    selectedFieldId = '';
    if (!lastRemoval) message = '';
  }

  function chooseDefinition(definition: CrmComponentDefinition) {
    if (!selectedPage) return;
    addingDefinition = definition;
    addingComponent = createComponent(definition, selectedPage);
    selectedComponentId = '';
    libraryOpen = false;
    selectedFieldId = '';
  }

  function changeField(fieldId: string, value: unknown) {
    if (!selectedComponent) return;
    selectedComponent.content = { ...selectedComponent.content, [fieldId]: value };
    selectedComponent.status = 'draft';
    if (addingComponent) addingComponent = { ...selectedComponent };
    else pages = [...pages];
  }

  function focusPreviewField(fieldId: string) {
    selectedFieldId = fieldId;
  }

  function focusEditorField(fieldId: string) {
    selectedFieldId = fieldId;
    componentEditor?.focusField(fieldId);
  }

  function closeEditor() {
    selectedComponentId = '';
    addingComponent = null;
    addingDefinition = null;
    selectedFieldId = '';
  }

  function confirmAdd() {
    if (!selectedPage || !addingComponent) return;
    selectedPage.components = [...selectedPage.components, addingComponent];
    pages = [...pages];
    selectedComponentId = addingComponent.id;
    addingComponent = null;
    addingDefinition = null;
    message = 'Component added to the unpublished draft.';
  }

  function toggleVisibility() {
    if (!selectedComponent) return;
    const visible = selectedComponent.enabled && selectedComponent.isVisible;
    selectedComponent.enabled = !visible;
    selectedComponent.isVisible = !visible;
    selectedComponent.status = 'draft';
    pages = [...pages];
  }

  function removeSelected() {
    if (!selectedPage || !selectedComponent || selectedComponent.type === 'hero_section') return;
    lastRemoval = {
      pageId: selectedPage.id,
      index: selectedPage.components.findIndex((component) => component.id === selectedComponent.id),
      component: structuredClone(selectedComponent),
    };
    selectedPage.components = selectedPage.components.filter(
      (component) => component.id !== selectedComponent.id,
    );
    pages = [...pages];
    closeEditor();
    message = 'Component removal is staged. It remains recoverable until you publish.';
  }

  function undoRemoval() {
    if (!lastRemoval) return;
    const page = pages.find((candidate) => candidate.id === lastRemoval?.pageId);
    if (!page || page.components.some((component) => component.id === lastRemoval?.component.id)) return;
    const next = [...page.components];
    next.splice(Math.min(lastRemoval.index, next.length), 0, lastRemoval.component);
    page.components = next;
    pages = [...pages];
    selectedPageId = page.id;
    selectedComponentId = lastRemoval.component.id;
    lastRemoval = null;
    message = 'Component removal was undone.';
  }

  function useLayoutVersion(version: CrmComponentLayoutVersion) {
    pages = clonePages(version.pages);
    selectedPageId = pages.find((page) => page.route === '/')?.id || pages[0]?.id || '';
    selectedComponentId = pages.find((page) => page.id === selectedPageId)?.components[0]?.id || '';
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
    historyOpen = false;
    lastRemoval = null;
    message = 'Retained layout loaded as an unpublished rollback draft. Review the preview before publishing.';
  }

  function moveComponent(index: number, direction: -1 | 1) {
    if (!selectedPage) return;
    const target = index + direction;
    if (target < 0 || target >= selectedPage.components.length) return;
    const next = [...selectedPage.components];
    [next[index], next[target]] = [next[target], next[index]];
    selectedPage.components = next;
    pages = [...pages];
  }

  async function publish() {
    if (!snapshot || !dirty || issues.length > 0 || state === 'publishing') return;
    const publishingTenant = tenantId;
    state = 'publishing';
    message = '';
    try {
      const latest = await backendClient.componentStudio(publishingTenant);
      if (tenantId !== publishingTenant) return;
      if (latest.versionToken !== snapshot.versionToken) {
        snapshot = latest;
        pages = clonePages(latest.pages);
        loadedSignature = pagesSignature(pages);
        lastRemoval = null;
        state = 'ready';
        message = 'The app layout changed on the server. The latest version is loaded; review it before publishing.';
        closeEditor();
        return;
      }
      await backendClient.publishPageLayout(
        publishingTenant,
        publishPayload(snapshot, pages),
        'Publish reviewed component layout from Operations Portal My App.',
        createIdempotencyKey('component-layout-publish'),
      );
      if (tenantId !== publishingTenant) return;
      message = 'Components published. Reloading the consumer layout…';
      const sequence = ++loadSequence;
      await load(publishingTenant, sequence, true);
      if (tenantId === publishingTenant && state === 'ready') {
        message = 'Components published and verified from the server.';
        closeEditor();
      }
    } catch {
      if (tenantId !== publishingTenant) return;
      state = 'ready';
      message = 'Components could not be published. Your draft is still here.';
    }
  }
</script>

{#if showPublishReview && snapshot}
  <ComponentPublishReview organizationName={configuration.name || 'this organization'} changes={publishChanges} busy={state === 'publishing'} onCancel={() => showPublishReview = false} onConfirm={() => { showPublishReview = false; void publish(); }} />
{/if}
{#if historyOpen && snapshot}
  <ComponentLayoutHistory versions={snapshot.versions || []} currentVersionToken={snapshot.versionToken} truncated={snapshot.historyTruncated === true} onUse={useLayoutVersion} onClose={() => historyOpen = false} />
{/if}

<div class="flex h-full min-h-0 flex-col gap-3">
  <div class="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
    <label class="block text-sm font-medium text-gray-700">Page
      <select class="mt-1 block min-w-56 rounded-md border border-gray-300 px-3 py-2" value={selectedPageId} disabled={state === 'loading' || state === 'publishing'} on:change={(event) => selectPage(event.currentTarget.value)}>
        {#each pages as page}<option value={page.id}>{page.title}</option>{/each}
      </select>
    </label>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <span class="mr-1 text-sm font-medium {dirty ? 'text-amber-800' : 'text-emerald-700'}">{dirty ? 'Unpublished component changes' : 'Published layout'}</span>
      <button type="button" class="crm-ui-button-secondary" on:click={() => historyOpen = true}>History</button>
      <button type="button" class="crm-ui-button-secondary" disabled={!dirty || state === 'publishing'} on:click={discardChanges}>Discard</button>
      <button type="button" class="crm-ui-button-primary" disabled={!dirty || issues.length > 0 || state === 'publishing'} on:click={() => showPublishReview = true}>{state === 'publishing' ? 'Publishing…' : 'Publish components'}</button>
    </div>
  </div>

  {#if message}
    <div class="crm-theme-selected flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm" role="status">
      <p>{message}</p>
      {#if lastRemoval}<button type="button" class="font-semibold underline" on:click={undoRemoval}>Undo removal</button>{/if}
    </div>
  {/if}
  {#if state === 'loading'}
    <p class="rounded-md border bg-white p-5 text-sm text-gray-600" role="status">Loading authoritative components…</p>
  {:else if state === 'error'}
    <div class="rounded-md border border-red-200 bg-red-50 p-5 text-sm text-red-900" role="alert">{message} <button type="button" class="font-semibold underline" on:click={() => resetAndLoad(tenantId)}>Retry</button></div>
  {:else if selectedPage && snapshot}
    <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div class="min-h-0 overflow-y-auto">
        <ComponentOutline page={selectedPage} definitions={snapshot.definitions} selectedId={selectedComponent?.id || ''} disabled={state === 'publishing'} onSelect={selectComponent} onMove={moveComponent} onAdd={() => libraryOpen = true} />
      </div>
      <div class="min-h-0 min-w-0 overflow-y-auto xl:overflow-hidden">
        {#if libraryOpen}
          <ComponentLibrary definitions={snapshot.definitions} page={selectedPage} onChoose={chooseDefinition} onClose={() => libraryOpen = false} />
        {:else if selectedComponent}
          <div class="grid min-w-0 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(18rem,.85fr)_minmax(22rem,1.15fr)]">
            <div class="min-h-0 xl:overflow-y-auto">
              <ComponentEditor bind:this={componentEditor} component={selectedComponent} definition={selectedDefinition} adding={Boolean(addingComponent)} busy={state === 'publishing'} onChange={changeField} onFieldFocus={focusPreviewField} onToggleVisibility={toggleVisibility} onRemove={removeSelected} onConfirmAdd={confirmAdd} onCancel={closeEditor} />
            </div>
            <section aria-label="Live isolated component preview" class="min-h-0 min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 p-2">
              <AppPreviewFrame compact {previewOrigin} tenantId={tenantId} environment={previewEnvironment} {configuration} {configurationReady} title={`${selectedComponent.label} isolated consumer preview`} {expectedSourceCommit} {expectedReleaseId} componentDraft={{ pageRoute: selectedPage.route, component: selectedComponent, selectedFieldId: selectedFieldId || null }} onFieldSelected={focusEditorField} />
            </section>
          </div>
        {:else}
          <div class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <div class="max-w-sm"><p class="font-semibold text-gray-900">Select a component</p><p class="mt-2 text-sm text-gray-600">Its settings and exact family-app rendering will appear together here. The page list stays visible so you can move between components quickly.</p></div>
          </div>
        {/if}
      </div>
    </div>
  {:else if state === 'ready'}
    <p class="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">No authored pages are available for this organization yet.</p>
  {/if}

  {#if state === 'ready' || state === 'publishing'}
    <p class="sr-only" aria-live="polite">{issues.length > 0 ? `Resolve ${issues.length} component issues before publishing.` : dirty ? 'Component draft ready for review.' : 'No unpublished component changes.'}</p>
  {/if}
</div>
