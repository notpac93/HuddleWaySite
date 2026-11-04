<script lang="ts">
  import { toast } from '../ui/toast';
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
  import type { AppPreviewEnvironment, AppPagePreviewDraft } from '../../../lib/crm/appPreviewProtocol';
  import { clearPortalDraft, registerPortalDraft } from '../../../lib/ui/portalDraftGuard';
  import AppPreviewFrame from '../app/AppPreviewFrame.svelte';
  import ComponentEditor from './ComponentEditor.svelte';
  import ComponentLibrary from './ComponentLibrary.svelte';
  import ComponentLayoutHistory from './ComponentLayoutHistory.svelte';
  import ComponentOutline from './ComponentOutline.svelte';
  import ComponentPublishReview from './ComponentPublishReview.svelte';
  import ComponentPlacement from './ComponentPlacement.svelte';
  import CanvasEditingToolbar from './CanvasEditingToolbar.svelte';
  import { createCanvasEditingSession } from './canvasEditingSession';
  import { canvasPageDraft } from './canvasPageDraft';
  import { insertComponent, moveComponentTo, locationLabel, type LayoutLocation } from './componentLayoutCommands';
  import {
    clonePages,
    componentChangeSummary,
    createComponent, definitionAvailable,
    pagesSignature,
    publishPayload,
    validatePages,
  } from './componentStudioDraft';
  export let tenantId: string;
  export let active = true;
  export let previewActive = true;
  export let configuration: CrmAppConfiguration;
  export let configurationReady: boolean;
  export let previewOrigin: string | null;
  export let previewEnvironment: AppPreviewEnvironment;
  export let expectedSourceCommit = '';
  export let expectedReleaseId = '';
  export let externalCanvas = false;
  export let previewSynced = false;
  export let onPageDraftChange: (draft: AppPagePreviewDraft | null) => void = () => {};
  export let canvasOnly = false;
  export let canvasEditing = false;
  export let editSessionId = '';
  export let onDone: () => void = () => {};
  export let onSettings: () => void = () => {};
  let snapshot: CrmComponentStudioSnapshot | null = null;
  let conflictSnapshot: CrmComponentStudioSnapshot | null = null;
  let pages: CrmComponentStudioPage[] = [];
  let selectedPageId = '';
  let selectedComponentId = '';
  let addingComponent: CrmPageComponent | null = null;
  let addingDefinition: CrmComponentDefinition | null = null;
  let libraryOpen = false;
  let editorOpen = false;
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
  let insertion: LayoutLocation = { beforeId: null };
  let undoStack: CrmComponentStudioPage[][] = [];
  let redoStack: CrmComponentStudioPage[][] = [];
  let lastHistoryField = '';
  let canvasTextActive = false;
  $: provisionalComponents = selectedPage && addingComponent
    ? insertComponent(selectedPage, addingComponent, insertion) : null;
  $: onPageDraftChange(selectedPage && snapshot?.tenantId === tenantId
    ? canvasPageDraft(selectedPage, provisionalComponents || selectedPage.components, snapshot.definitions, canvasEditing && state === 'ready', addingComponent?.id || null, editSessionId) : null);
  function beginCanvasText() {
    const before = clonePages(pages), provisional = structuredClone(addingComponent), undo = undoStack, redo = redoStack;
    lastHistoryField = ''; canvasTextActive = true;
    return () => { pages = before; addingComponent = provisional; undoStack = undo; redoStack = redo; lastHistoryField = ''; canvasTextActive = false; };
  }
  const canvasAction = createCanvasEditingSession({
    enabled: () => canvasEditing && state === 'ready', page: () => selectedPage, definitions: () => snapshot?.definitions || [],
    provisional: () => addingComponent, select: (id) => selectedComponentId = id, beginText: beginCanvasText,
    endText: () => { lastHistoryField = ''; canvasTextActive = false; }, change: (id, field, value) => changeField(field, value, addingComponent?.id === id ? addingComponent : selectedPage?.components.find((item) => item.id === id)),
    add: (beforeId, definition) => { openLibrary(beforeId); chooseDefinition(definition); libraryOpen = false; },
    confirm: confirmAdd, cancel: closeEditor, remove: removeSelected, moveTo: (id, beforeId) => moveTo(id, { beforeId }), notice: (text) => message = text,
    navigate: (route) => { const target = pages.find((page) => page.route === route); if (target) { selectPage(target.id); if (!target.components.length) message = 'This screen shows the normal app. Wording without an outline is not editable yet.'; } else message = 'This screen shows the normal app. Wording without an outline is not editable yet.'; },
  });
  export const handleCanvasAction = canvasAction;
  $: if (!canvasEditing || state !== 'ready' || tenantId !== activeTenantId) canvasAction.reset();
  $: if (canvasOnly && !canvasEditing) { addingComponent = null; addingDefinition = null; }
  function checkpoint(field = '') {
    if (field && field === lastHistoryField) return;
    undoStack = [...undoStack.slice(-29), clonePages(pages)];
    redoStack = [];
    lastHistoryField = field;
  }

  function undo(redo = false) {
    canvasAction.reset();
    const source = redo ? redoStack : undoStack;
    if (state !== 'ready' || source.length === 0) return;
    const prior = source[source.length - 1];
    if (redo) { undoStack = [...undoStack, clonePages(pages)]; redoStack = source.slice(0, -1); }
    else { redoStack = [...redoStack, clonePages(pages)]; undoStack = source.slice(0, -1); }
    pages = clonePages(prior);
    closeEditor(); lastRemoval = null; lastHistoryField = '';
    message = redo ? 'Change redone in your draft.' : 'Change undone in your draft.';
  }

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
  $: if (active && dirty && tenantId) {
    registerPortalDraft({
      id: 'my-app-components',
      title: 'Unpublished component changes',
      message: 'Keep your draft for this session, discard it, or stay on this page.',
      retainLabel: 'Keep draft and leave',
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
    conflictSnapshot = null;
    pages = [];
    selectedPageId = '';
    selectedComponentId = '';
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
    editorOpen = false;
    message = '';
    lastRemoval = null;
    showPublishReview = false;
    historyOpen = false;
    undoStack = []; redoStack = []; lastHistoryField = '';
    state = nextTenantId ? 'loading' : 'idle';
    if (nextTenantId) void load(nextTenantId, loadSequence);
  }

  async function load(expectedTenantId: string, sequence: number, preserveMessage = false) {
    try {
      const result = await backendClient.componentStudio(expectedTenantId);
      if (sequence !== loadSequence || tenantId !== expectedTenantId) return;
      snapshot = result;
      conflictSnapshot = null;
      pages = clonePages(result.pages);
      loadedSignature = pagesSignature(pages);
      lastRemoval = null;
      undoStack = []; redoStack = []; lastHistoryField = '';
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
    if (conflictSnapshot) { snapshot = conflictSnapshot; conflictSnapshot = null; }
    const previouslySelectedComponentId = selectedComponentId;
    pages = clonePages(snapshot.pages);
    loadedSignature = pagesSignature(snapshot.pages);
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
    undoStack = []; redoStack = []; lastHistoryField = '';
  }

  function selectPage(pageId: string) {
    canvasAction.reset();
    lastHistoryField = '';
    editorOpen = false;
    selectedPageId = pageId; message = canvasOnly && !pages.find((page) => page.id === pageId)?.components.length ? 'This page has no editable wording yet. You can still use its tabs.' : '';
    selectedComponentId = pages.find((page) => page.id === pageId)?.components[0]?.id || '';
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
  }

  function selectComponent(component: CrmPageComponent) {
    lastHistoryField = '';
    editorOpen = true;
    selectedComponentId = component.id;
    addingComponent = null;
    addingDefinition = null;
    libraryOpen = false;
    selectedFieldId = '';
    if (!lastRemoval) message = '';
  }

  function chooseDefinition(definition: CrmComponentDefinition) {
    if (!selectedPage || state !== 'ready' || !definitionAvailable(definition, selectedPage)) return;
    editorOpen = true;
    addingDefinition = definition;
    addingComponent = createComponent(definition, selectedPage);
    selectedComponentId = '';
    libraryOpen = false;
    selectedFieldId = '';
  }

  function changeField(fieldId: string, value: unknown, component = selectedComponent) {
    if (!component || state !== 'ready') return;
    if (!addingComponent) checkpoint(`${component.id}:${fieldId}`);
    component.content = { ...component.content, [fieldId]: value };
    component.status = 'draft';
    if (addingComponent) addingComponent = { ...component };
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
    editorOpen = false;
    selectedComponentId = '';
    addingComponent = null;
    addingDefinition = null;
    selectedFieldId = '';
  }

  function confirmAdd() {
    if (!selectedPage || !addingComponent || !provisionalComponents || state !== 'ready') return;
    checkpoint();
    selectedPage.components = provisionalComponents;
    pages = [...pages];
    selectedComponentId = addingComponent.id;
    addingComponent = null;
    addingDefinition = null;
    message = 'Component added to the unpublished draft. Review and publish when ready.';
  }

  function openLibrary(beforeId: string | null = null) {
    insertion = { beforeId };
    addingComponent = null; addingDefinition = null;
    libraryOpen = true;
  }

  function toggleVisibility() {
    if (!selectedComponent || selectedComponent.type === 'hero_section' || state !== 'ready') return;
    checkpoint();
    const visible = selectedComponent.enabled && selectedComponent.isVisible;
    selectedComponent.enabled = !visible;
    selectedComponent.isVisible = !visible;
    selectedComponent.status = 'draft';
    pages = [...pages];
  }

  function removeSelected(id = selectedComponent?.id) {
    const component = selectedPage?.components.find((item) => item.id === id);
    if (!selectedPage || !component || component.type === 'hero_section' || state !== 'ready') return;
    checkpoint();
    lastRemoval = {
      pageId: selectedPage.id,
      index: selectedPage.components.findIndex((item) => item.id === component.id),
      component: structuredClone(component),
    };
    selectedPage.components = selectedPage.components.filter(
      (item) => item.id !== component.id,
    );
    pages = [...pages];
    closeEditor();
    message = 'Component removal is staged. It remains recoverable until you publish.';
  }

  function undoRemoval() {
    if (!lastRemoval || state !== 'ready') return;
    const page = pages.find((candidate) => candidate.id === lastRemoval?.pageId);
    if (!page || page.components.some((component) => component.id === lastRemoval?.component.id)) return;
    checkpoint();
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
    if (state !== 'ready') return;
    checkpoint();
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
    moveTo(selectedPage.components[index].id, {
      beforeId: direction === -1 ? selectedPage.components[target].id
        : selectedPage.components[target + 1]?.id || null,
    });
  }

  function moveTo(id: string, location: LayoutLocation) {
    if (!selectedPage || state !== 'ready') return;
    const next = moveComponentTo(selectedPage, id, location);
    if (!next || next.every((item, index) => item.id === selectedPage.components[index]?.id)) return;
    checkpoint();
    selectedPage.components = next;
    pages = [...pages];
    const component = next.find((item) => item.id === id)!;
    message = `${component.label} moved to position ${next.findIndex((item) => item.id === id) + 1} in your draft.`;
  }

  async function publish() {
    if (!snapshot || !dirty || issues.length > 0 || state === 'publishing' || (externalCanvas && !previewSynced)) return;
    const publishingTenant = tenantId;
    const publishingSequence = loadSequence;
    state = 'publishing';
    message = '';
    try {
      const latest = await backendClient.componentStudio(publishingTenant);
      if (tenantId !== publishingTenant || publishingSequence !== loadSequence) return;
      if (latest.versionToken !== snapshot.versionToken) {
        conflictSnapshot = latest;
        state = 'ready';
        message = 'The app layout changed on the server. Your draft is retained. Discard loads the latest layout; copy any wording you want to keep before discarding.';
        return;
      }
      await backendClient.publishPageLayout(
        publishingTenant,
        publishPayload(snapshot, pages),
        'Publish reviewed component layout from Operations Portal My App.',
        createIdempotencyKey('component-layout-publish'),
      );
      if (tenantId !== publishingTenant || publishingSequence !== loadSequence) return;
      message = 'Components published. Reloading the consumer layout…';
      const sequence = ++loadSequence;
      await load(publishingTenant, sequence, true);
      if (tenantId === publishingTenant && state === 'ready') {
        message = 'Components published and verified from the server.';
        closeEditor();
      }
    } catch {
      if (tenantId !== publishingTenant || publishingSequence !== loadSequence) return;
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

{#if canvasOnly}
  <CanvasEditingToolbar {pages} pageId={selectedPageId} busy={state === 'publishing'} {dirty} canUndo={undoStack.length > 0 && !canvasTextActive} canRedo={redoStack.length > 0 && !canvasTextActive} canPublish={dirty && issues.length === 0 && state === 'ready' && previewSynced && !addingComponent && !canvasTextActive} retryable={state === 'error'} onRetry={() => resetAndLoad(tenantId)} message={state === 'loading' ? 'Loading editing guides…' : message} canManage={!canvasTextActive && state === 'ready'} onDiscard={discardChanges} onHistory={() => historyOpen = true} onPage={selectPage} onUndo={() => undo()} onRedo={() => undo(true)} onReview={() => showPublishReview = true} {onDone} {onSettings} />
{:else}
<div class="flex h-full min-h-0 flex-col gap-3">
  <div class:layout-toolbar={externalCanvas} class="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
    <label class="block text-sm font-medium text-gray-700">Page
      <select class="mt-1 block min-w-56 rounded-md border border-gray-300 px-3 py-2" value={selectedPageId} disabled={state === 'loading' || state === 'publishing'} on:change={(event) => selectPage(event.currentTarget.value)}>
        {#each pages as page}<option value={page.id}>{page.title}</option>{/each}
      </select>
    </label>
    {#if externalCanvas}<span class="text-xs {dirty ? 'text-amber-800' : 'text-emerald-700'}">{dirty ? 'Unpublished component changes' : 'Published layout'}</span>{/if}
    <div class="flex flex-wrap items-center justify-end gap-2">
      <button type="button" class="crm-ui-button-secondary" disabled={!undoStack.length || state !== 'ready'} on:click={() => undo()}>Undo</button>
      <button type="button" class="crm-ui-button-secondary" disabled={!redoStack.length || state !== 'ready'} on:click={() => undo(true)}>Redo</button>
      {#if !externalCanvas}<span class="mr-1 text-sm font-medium {dirty ? 'text-amber-800' : 'text-emerald-700'}">{dirty ? 'Unpublished component changes' : 'Published layout'}</span>{/if}
      {#if externalCanvas}
        <details class="relative"><summary class="cursor-pointer rounded border px-2 py-2 text-xs">More</summary>
          <div class="absolute right-0 z-20 min-w-32 rounded border bg-white p-2 shadow-lg">
            <button type="button" class="crm-ui-button-secondary" on:click={() => historyOpen = true}>History</button>
            <button type="button" class="crm-ui-button-secondary" disabled={!dirty || state === 'publishing'} on:click={discardChanges}>Discard</button>
          </div>
        </details>
      {:else}
        <button type="button" class="crm-ui-button-secondary" on:click={() => historyOpen = true}>History</button>
        <button type="button" class="crm-ui-button-secondary" disabled={!dirty || state === 'publishing'} on:click={discardChanges}>Discard</button>
      {/if}
      <button type="button" class="crm-ui-button-primary" disabled={!dirty || issues.length > 0 || state === 'publishing' || (externalCanvas && !previewSynced)} on:click={() => showPublishReview = true}>{state === 'publishing' ? 'Publishing…' : 'Publish components'}</button>
    </div>
  </div>

  {#if message}
    <div use:toast={{dismiss: () => message = ''}} class="crm-theme-selected flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm" role="status">
      <p>{message}</p>
      {#if lastRemoval}<button type="button" class="font-semibold underline" on:click={undoRemoval}>Undo removal</button>{/if}
    </div>
  {/if}
  {#if state === 'loading'}
    <p class="rounded-md border bg-white p-5 text-sm text-gray-600" role="status">Loading authoritative components…</p>
  {:else if state === 'error'}
    <div class="rounded-md border border-red-200 bg-red-50 p-5 text-sm text-red-900" role="alert">{message} <button type="button" class="font-semibold underline" on:click={() => resetAndLoad(tenantId)}>Retry</button></div>
  {:else if selectedPage && snapshot}
    <div class="grid min-h-0 flex-1 gap-3 {externalCanvas ? 'overflow-y-auto' : 'lg:grid-cols-[19rem_minmax(0,1fr)]'}">
      {#if !externalCanvas || (!editorOpen && !libraryOpen)}
      <div class="min-h-0 overflow-y-auto">
        <ComponentOutline compact={externalCanvas} page={selectedPage} definitions={snapshot.definitions} selectedId={selectedComponent?.id || ''} disabled={state === 'publishing'} onSelect={selectComponent} onMove={moveComponent} onMoveTo={moveTo} onInsert={openLibrary} onAdd={() => openLibrary()} />
      </div>
      {/if}
      {#if !externalCanvas || editorOpen || libraryOpen}
      <div class="min-h-0 min-w-0 overflow-y-auto xl:overflow-hidden">
        {#if externalCanvas && (editorOpen || libraryOpen)}
          <button type="button" class="crm-ui-button-secondary mb-3" on:click={() => { closeEditor(); libraryOpen = false; }}>Back to layout</button>
        {/if}
        {#if libraryOpen}
          <ComponentLibrary pagePreview={externalCanvas} definitions={snapshot.definitions} page={selectedPage} onChoose={chooseDefinition} onClose={() => libraryOpen = false} />
        {:else if selectedComponent}
          <div class="grid min-w-0 gap-3 {externalCanvas ? '' : 'xl:h-full xl:min-h-0 xl:grid-cols-[minmax(18rem,.85fr)_minmax(22rem,1.15fr)]'}">
            <div class="min-h-0 xl:overflow-y-auto">
              {#if addingComponent && addingComponent.type !== 'hero_section'}
                <ComponentPlacement page={selectedPage} location={insertion} disabled={state === 'publishing'} onChange={(location) => insertion = location} />
                <p class="my-2 text-sm" role="status">Preview · Not added yet · {locationLabel(selectedPage, insertion)}</p>
              {/if}
              <ComponentEditor bind:this={componentEditor} component={selectedComponent} definition={selectedDefinition} adding={Boolean(addingComponent)} busy={state === 'publishing'} onChange={changeField} onFieldFocus={focusPreviewField} onToggleVisibility={toggleVisibility} onRemove={() => removeSelected()} onConfirmAdd={confirmAdd} onCancel={closeEditor} />
            </div>
            {#if !externalCanvas}
            <section aria-label="Live isolated component preview" class="min-h-0 min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 p-2">
              {#if previewActive}
              <AppPreviewFrame compact deferUntilVisible {previewOrigin} tenantId={tenantId} environment={previewEnvironment} {configuration} {configurationReady} title={`${selectedComponent.label} isolated consumer preview`} {expectedSourceCommit} {expectedReleaseId} componentDraft={{ pageRoute: selectedPage.route, component: selectedComponent, selectedFieldId: selectedFieldId || null }} onFieldSelected={focusEditorField} />
              {/if}
            </section>
            {/if}
          </div>
        {:else}
          <div class="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <div class="max-w-sm"><p class="font-semibold text-gray-900">Select a component</p><p class="mt-2 text-sm text-gray-600">Its settings and exact family-app rendering will appear together here. The page list stays visible so you can move between components quickly.</p></div>
          </div>
        {/if}
      </div>
      {/if}
    </div>
  {:else if state === 'ready'}
    <p class="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">No authored pages are available for this organization yet.</p>
  {/if}

  {#if state === 'ready' || state === 'publishing'}
    <p class="sr-only" aria-live="polite">{issues.length > 0 ? `Resolve ${issues.length} component issues before publishing.` : dirty ? 'Component draft ready for review.' : 'No unpublished component changes.'}</p>
  {/if}
</div>
{/if}

<style>
  .layout-toolbar { gap: 8px; }
  .layout-toolbar label { display: flex; align-items: center; gap: 8px; }
  .layout-toolbar select { min-width: 0; width: 110px; margin-top: 0; }
  .layout-toolbar > div { gap: 4px; justify-content: flex-start; }
  .layout-toolbar > div > span { font-size: 11px; }
  .layout-toolbar :global(button) { min-height: 36px; padding: 6px 8px; font-size: 12px; }
  @media (max-width: 767px) { .layout-toolbar :global(button), .layout-toolbar :global(summary) { min-height: 44px; } }
</style>
