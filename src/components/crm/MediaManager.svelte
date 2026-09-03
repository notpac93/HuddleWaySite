<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../../lib/firebase';
  import {
    collection, documentId, limit, onSnapshot, orderBy, query, where,
  } from 'firebase/firestore';
  import { activeTenantRole, tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../lib/api/BackendApi';
  import { eventsStore, seasonsStore } from '../../lib/services/DataStore';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import PageHeader from './ui/PageHeader.svelte';
  import EmptyState from './ui/EmptyState.svelte';

  type MediaFile = {
    id: string; name: string | null; url: string; storagePath: string;
    category: string | null; purpose: string | null; altText: string | null;
    createdAt: Date | null; sizeBytes: number | null; contentType: string | null;
    width: number | null; height: number | null; uploadedBy: string | null;
  };

  let mediaFiles: MediaFile[] = [];
  let unsubscribe = () => {};
  let activeCategory = 'All';
  const baseCategories = ['All', 'Logos', 'Banners', 'Flyers', 'Uncategorized'];
  let searchQuery = '';
  let mediaLoadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let mediaLoadMessage = '';
  let operationMessage = '';
  let mediaTruncated = false;
  let loadGeneration = 0;
  let selected: MediaFile | null = null;
  let selectedIds: string[] = [];
  let bulkCategory = 'Banners';
  let uploadOpen = false;
  let uploadFile: File | null = null;
  let uploadCategory = 'Banners';
  let uploadPurpose = 'Reusable program image';
  let uploadAltText = '';
  let uploadState: 'idle' | 'review' | 'saving' | 'error' = 'idle';
  let deleteReason = '';
  let deleteState: 'idle' | 'confirm' | 'saving' | 'error' = 'idle';
  const MEDIA_LIMIT = 100;

  $: canManage = ['owner', 'editor', 'platform_admin'].includes(String($activeTenantRole || ''));
  $: categories = [...new Set([...baseCategories, ...mediaFiles.map((media) => media.category || 'Uncategorized')])];
  $: usageByUrl = (() => {
    const usage = new Map<string, string[]>();
    const add = (url: string, label: string) => {
      if (!url) return;
      usage.set(url, [...(usage.get(url) || []), label]);
    };
    $eventsStore.forEach((event) => add(String(event.imageUrl || ''), `Event: ${event.title || event.name || event.id}`));
    $seasonsStore.forEach((season) => add(String(season.imageUrl || ''), `Season: ${season.name || season.title || season.id}`));
    return usage;
  })();
  $: filteredMedia = mediaFiles.filter((media) => {
    const matchesCategory = activeCategory === 'All'
      || (activeCategory === 'Uncategorized' && !media.category)
      || media.category === activeCategory;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const usage = (usageByUrl.get(media.url) || []).join(' ');
    return matchesCategory && (!normalizedQuery || [media.name, media.category, media.altText, media.purpose, usage]
      .some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));
  });

  $: {
    if ($tenantIdStore) {
      const tenantId = $tenantIdStore;
      const generation = ++loadGeneration;
      unsubscribe();
      mediaFiles = [];
      mediaTruncated = false;
      mediaLoadState = 'loading';
      mediaLoadMessage = '';
      const q = query(collection(db, 'program_images'), where('tenantId', '==', tenantId), orderBy(documentId(), 'asc'), limit(MEDIA_LIMIT + 1));
      unsubscribe = onSnapshot(q, (snapshot) => {
        if (generation !== loadGeneration || $tenantIdStore !== tenantId) return;
        const activeDocs = snapshot.docs.filter((entry) => entry.data().isActive !== false);
        mediaTruncated = activeDocs.length > MEDIA_LIMIT;
        mediaFiles = activeDocs.slice(0, MEDIA_LIMIT).map((entry) => {
          const data = entry.data();
          const size = Number(data.sizeBytes ?? data.size);
          return {
            id: entry.id,
            name: typeof (data.fileName || data.name) === 'string' && String(data.fileName || data.name).trim() ? String(data.fileName || data.name).trim() : null,
            url: String(data.imageUrl || data.url || ''),
            storagePath: String(data.storagePath || ''),
            category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : null,
            purpose: typeof data.purpose === 'string' && data.purpose.trim() ? data.purpose.trim() : null,
            altText: typeof data.altText === 'string' && data.altText.trim() ? data.altText.trim() : null,
            createdAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : (data.createdAt?.toDate ? data.createdAt.toDate() : null),
            sizeBytes: Number.isFinite(size) ? size : null,
            contentType: typeof data.contentType === 'string' ? data.contentType : null,
            width: Number.isFinite(Number(data.width)) ? Number(data.width) : null,
            height: Number.isFinite(Number(data.height)) ? Number(data.height) : null,
            uploadedBy: typeof data.uploadedBy === 'string' ? data.uploadedBy : null,
          };
        });
        mediaLoadState = 'ready';
      }, () => {
        if (generation !== loadGeneration || $tenantIdStore !== tenantId) return;
        console.error('Media files could not be loaded.');
        mediaFiles = [];
        mediaLoadState = 'error';
        mediaLoadMessage = 'Media files could not be loaded. Check your access and try again.';
      });
    } else {
      loadGeneration += 1;
      unsubscribe();
      mediaFiles = [];
      mediaLoadState = 'idle';
      mediaLoadMessage = '';
    }
  }

  onMount(() => () => { loadGeneration += 1; unsubscribe(); });

  function safeMediaUrl(value: string) {
    try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.toString() : ''; } catch { return ''; }
  }
  function bytes(value: number | null) {
    if (value == null) return 'Size unavailable';
    return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  function imageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(objectUrl); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); resolve({ width: 0, height: 0 }); };
      image.src = objectUrl;
    });
  }

  async function uploadMedia() {
    const tenantId = $tenantIdStore;
    if (!tenantId || !uploadFile || uploadState === 'saving') return;
    uploadState = 'saving'; operationMessage = '';
    try {
      if (mediaFiles.some((media) => media.name?.toLowerCase() === uploadFile?.name.toLowerCase())) {
        throw new Error('An active asset already uses this filename. Rename the file or replace the existing asset deliberately.');
      }
      const dimensions = await imageDimensions(uploadFile);
      const uploadKey = createIdempotencyKey('program-media-upload');
      const uploaded = await backendClient.uploadImageAsset(
        tenantId,
        uploadFile,
        'program-library',
        uploadKey,
      );
      await backendClient.publishProgramMedia(
        tenantId,
        uploaded.reservationId,
        {
          fileName: uploadFile.name,
          category: uploadCategory,
          purpose: uploadPurpose.trim(),
          altText: uploadAltText.trim(),
          width: dimensions.width || null,
          height: dimensions.height || null,
        },
        'Add a reviewed image to the reusable program media library.',
        `${uploadKey}:publish`,
      );
      operationMessage = `Uploaded ${uploadFile.name} to the reusable program library.`;
      uploadState = 'idle';
      closeUpload();
    } catch (error) {
      uploadState = 'error';
      operationMessage = error instanceof BackendApiError
        ? 'The image could not be added to the library. Review the file and try again.'
        : error instanceof Error ? error.message : 'Image upload failed. Please try again.';
    }
  }
  function closeUpload() {
    if (uploadState === 'saving') return;
    uploadOpen = false; uploadFile = null; uploadAltText = ''; uploadPurpose = 'Reusable program image'; uploadState = 'idle';
  }
  async function applyBulkCategory() {
    if (!canManage || selectedIds.length === 0) return;
    operationMessage = '';
    try {
      const requestedIds = [...selectedIds];
      const results = await Promise.allSettled(requestedIds.map((id) => {
        const media = mediaFiles.find((entry) => entry.id === id);
        if (!media) return Promise.reject(new Error('Media record unavailable'));
        return backendClient.updateMedia(
          String($tenantIdStore || ''),
          id,
          {
            fileName: media.name || 'Unnamed asset',
            category: bulkCategory,
            purpose: media.purpose || 'Reusable program image',
            altText: media.altText || media.name || 'Program image',
          },
          `Categorize the selected media asset as ${bulkCategory}.`,
          createIdempotencyKey('program-media-category'),
        );
      }));
      const failedIds = requestedIds.filter((_, index) => results[index].status === 'rejected');
      const succeeded = requestedIds.length - failedIds.length;
      operationMessage = failedIds.length
        ? `Categorized ${succeeded} asset${succeeded === 1 ? '' : 's'}; ${failedIds.length} could not be updated and remain selected for retry.`
        : `Categorized ${succeeded} asset${succeeded === 1 ? '' : 's'} as ${bulkCategory}.`;
      selectedIds = failedIds;
    } catch { operationMessage = 'Selected assets could not be categorized.'; }
  }
  async function saveMetadata() {
    if (!selected || !canManage) return;
    try {
      await backendClient.updateMedia(
        String($tenantIdStore || ''),
        selected.id,
        {
          fileName: selected.name || 'Unnamed asset',
          category: selected.category || 'Uncategorized',
          purpose: selected.purpose || 'Reusable program image',
          altText: selected.altText || selected.name || 'Program image',
        },
        'Correct reusable media metadata.',
        createIdempotencyKey('program-media-update'),
      );
      operationMessage = 'Asset metadata updated.';
    } catch { operationMessage = 'Asset metadata could not be updated.'; }
  }
  async function copyUrl() {
    if (!selected || !safeMediaUrl(selected.url)) return;
    try { await navigator.clipboard.writeText(selected.url); operationMessage = 'Asset URL copied.'; } catch { operationMessage = 'The browser could not copy the asset URL.'; }
  }
  async function removeAsset() {
    if (!selected || !canManage || deleteReason.trim().length < 8 || deleteState === 'saving') return;
    if ((usageByUrl.get(selected.url) || []).length > 0) return;
    deleteState = 'saving'; operationMessage = '';
    try {
      await backendClient.deleteMedia(
        String($tenantIdStore || ''),
        selected.id,
        deleteReason.trim(),
        createIdempotencyKey('program-media-delete'),
      );
      operationMessage = 'Asset archived and removed from the active library.';
      selected = null; deleteState = 'idle'; deleteReason = '';
    } catch { deleteState = 'error'; operationMessage = 'Asset removal failed. Retry after checking your access.'; }
  }
</script>

{#if uploadOpen}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="media-upload-title">
    <div class="flex min-h-full items-center justify-center p-4">
      <button type="button" class="fixed inset-0 z-0 h-full w-full bg-slate-950/70" aria-label="Close upload image" disabled={uploadState === 'saving'} on:click={closeUpload}></button>
      <div class="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" tabindex="-1" use:modalFocus={{ onEscape: closeUpload, initialFocusSelector: 'input' }}>
        <h3 id="media-upload-title" class="text-lg font-semibold">{uploadState === 'review' || uploadState === 'saving' || uploadState === 'error' ? 'Review image upload' : 'Upload image'}</h3>
        {#if uploadState === 'review' || uploadState === 'saving' || uploadState === 'error'}
          <div class="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm"><p><strong>File:</strong> {uploadFile?.name}</p><p><strong>Category:</strong> {uploadCategory}</p><p><strong>Purpose:</strong> {uploadPurpose}</p><p><strong>Alt text:</strong> {uploadAltText}</p></div>
        {:else}
          <div class="mt-4 space-y-4">
            <label class="block text-sm font-medium">Image<input class="mt-1 block w-full rounded-md border p-2" type="file" accept="image/png,image/jpeg,image/gif,image/webp" on:change={(event) => uploadFile = (event.currentTarget as HTMLInputElement).files?.[0] || null} /></label>
            <label class="block text-sm font-medium">Category<select class="mt-1 block w-full rounded-md border p-2" bind:value={uploadCategory}><option>Logos</option><option>Banners</option><option>Flyers</option></select></label>
            <label class="block text-sm font-medium">Purpose<input class="mt-1 block w-full rounded-md border p-2" bind:value={uploadPurpose} maxlength="120" /></label>
            <label class="block text-sm font-medium">Alt text<textarea class="mt-1 block w-full rounded-md border p-2" bind:value={uploadAltText} maxlength="240" rows="2"></textarea></label>
          </div>
        {/if}
        {#if uploadState === 'error'}<p class="mt-3 text-sm text-red-700" role="alert">{operationMessage}</p>{/if}
        <div class="mt-6 flex justify-end gap-3"><button type="button" class="rounded-md border px-4 py-2 text-sm" disabled={uploadState === 'saving'} on:click={() => uploadState === 'idle' ? closeUpload() : uploadState = 'idle'}>{uploadState === 'idle' ? 'Cancel' : 'Back'}</button>{#if uploadState === 'idle'}<button type="button" class="crm-ui-primary-button" disabled={!uploadFile || !uploadPurpose.trim() || !uploadAltText.trim()} on:click={() => uploadState = 'review'}>Review upload</button>{:else}<button type="button" class="crm-ui-primary-button" disabled={uploadState === 'saving'} on:click={uploadMedia}>{uploadState === 'saving' ? 'Uploading…' : 'Upload to library'}</button>{/if}</div>
      </div>
    </div>
  </div>
{/if}

{#if selected}
  <div class="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-labelledby="media-detail-title">
    <button type="button" class="absolute inset-0" aria-label="Close media details" on:click={() => selected = null}></button>
    <aside class="relative z-10 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" tabindex="-1" use:modalFocus={{ onEscape: () => selected = null, initialFocusSelector: 'button' }}>
      <div class="flex items-start justify-between"><div><h3 id="media-detail-title" class="text-xl font-semibold">Asset details</h3><p class="text-sm text-gray-500">Identity: {selected.id}</p></div><button type="button" class="rounded-md border px-3 py-2 text-sm" on:click={() => selected = null}>Close</button></div>
      {#if safeMediaUrl(selected.url)}<img class="mt-5 max-h-80 w-full rounded-lg bg-gray-100 object-contain" src={safeMediaUrl(selected.url)} alt={selected.altText || selected.name || 'Media name unavailable'} width="640" height="480" />{/if}
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <label class="text-sm font-medium">Filename<input class="mt-1 block w-full rounded-md border p-2" bind:value={selected.name} disabled={!canManage} /></label>
        <label class="text-sm font-medium">Category<select class="mt-1 block w-full rounded-md border p-2" bind:value={selected.category} disabled={!canManage}><option value="">Uncategorized</option><option>Logos</option><option>Banners</option><option>Flyers</option></select></label>
        <label class="text-sm font-medium sm:col-span-2">Purpose<input class="mt-1 block w-full rounded-md border p-2" bind:value={selected.purpose} disabled={!canManage} /></label>
        <label class="text-sm font-medium sm:col-span-2">Alt text<textarea class="mt-1 block w-full rounded-md border p-2" bind:value={selected.altText} disabled={!canManage} rows="2"></textarea></label>
      </div>
      <dl class="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt class="text-gray-500">Dimensions</dt><dd>{selected.width && selected.height ? `${selected.width} × ${selected.height}` : 'Unavailable'}</dd></div><div><dt class="text-gray-500">Size</dt><dd>{bytes(selected.sizeBytes)}</dd></div><div><dt class="text-gray-500">Type</dt><dd>{selected.contentType || 'Unavailable'}</dd></div><div><dt class="text-gray-500">Uploaded</dt><dd>{selected.createdAt ? selected.createdAt.toLocaleDateString() : 'Unavailable'}</dd></div><div class="col-span-2"><dt class="text-gray-500">Uploaded by</dt><dd>{selected.uploadedBy || 'Unavailable'}</dd></div></dl>
      <section class="mt-5 rounded-md border p-4"><h4 class="font-semibold">Usage locations ({usageByUrl.get(selected.url)?.length || 0})</h4>{#if usageByUrl.get(selected.url)?.length}<ul class="mt-2 list-disc pl-5 text-sm">{#each usageByUrl.get(selected.url) || [] as location}<li>{location}</li>{/each}</ul>{:else}<p class="mt-1 text-sm text-gray-600">No event or season currently references this exact asset URL.</p>{/if}</section>
      <div class="mt-5 flex flex-wrap gap-2"><button type="button" class="crm-ui-primary-button" disabled={!canManage} on:click={saveMetadata}>Save metadata</button><button type="button" class="rounded-md border px-3 py-2 text-sm" disabled={!safeMediaUrl(selected.url)} on:click={copyUrl}>Copy URL</button>{#if safeMediaUrl(selected.url)}<a class="rounded-md border px-3 py-2 text-sm" href={safeMediaUrl(selected.url)} download target="_blank" rel="noopener noreferrer">Download</a>{/if}<button type="button" class="crm-ui-danger-button" disabled={!canManage || (usageByUrl.get(selected.url)?.length || 0) > 0} on:click={() => deleteState = 'confirm'}>Remove asset</button></div>
      {#if (usageByUrl.get(selected.url)?.length || 0) > 0}<p class="mt-2 text-sm text-amber-700">Replace this asset in every usage location before removal.</p>{/if}
      {#if deleteState !== 'idle'}<div class="mt-5 rounded-md border border-red-200 bg-red-50 p-4"><p class="text-sm">This soft-deletes the record and removes the stored object when possible.</p><label class="mt-3 block text-sm font-medium">Removal reason<textarea class="mt-1 block w-full rounded-md border p-2" bind:value={deleteReason} rows="2"></textarea></label><button type="button" class="crm-ui-danger-button mt-3" disabled={deleteReason.trim().length < 8 || deleteState === 'saving'} on:click={removeAsset}>{deleteState === 'saving' ? 'Removing…' : deleteState === 'error' ? 'Retry removal' : 'Confirm removal'}</button></div>{/if}
    </aside>
  </div>
{/if}

<div class="flex h-full flex-col space-y-6 overflow-y-auto bg-gray-50 p-4 sm:p-6">
  <PageHeader title="Media Library" support="Manage reusable program images, their purpose, accessibility metadata, and usage references."><svelte:fragment slot="actions"><button type="button" class="crm-ui-primary-button" disabled={!canManage} title={!canManage ? 'Viewer access is read-only.' : undefined} on:click={() => uploadOpen = true}>Upload image</button></svelte:fragment></PageHeader>
  {#if operationMessage}<p class="rounded-md border bg-white p-3 text-sm" role="status">{operationMessage}</p>{/if}
  <div class="grid gap-4 lg:grid-cols-[14rem,1fr]">
    <nav class="h-fit rounded-lg border bg-white p-4" aria-label="Media categories"><h3 class="mb-3 text-xs font-semibold uppercase text-gray-500">Categories</h3>{#each categories as category}<button class="mb-1 w-full rounded-md px-3 py-2 text-left text-sm {activeCategory === category ? 'crm-theme-selected' : 'hover:bg-gray-50'}" on:click={() => activeCategory = category}>{category}<span class="float-right text-xs">{category === 'All' ? mediaFiles.length : mediaFiles.filter((media) => category === 'Uncategorized' ? !media.category : media.category === category).length}</span></button>{/each}</nav>
    <main class="rounded-lg border bg-white p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label class="text-sm font-medium">Search media files<input type="search" class="mt-1 block w-full rounded-md border p-2 sm:w-80" bind:value={searchQuery} placeholder="Filename, category, alt text, or usage" /></label>{#if searchQuery}<button type="button" class="rounded-md border px-3 py-2 text-sm" on:click={() => searchQuery = ''}>Clear search</button>{/if}</div>
      {#if mediaFiles.some((media) => !media.category)}<div class="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-amber-200 bg-amber-50 p-3"><p class="mr-auto text-sm text-amber-900">{mediaFiles.filter((media) => !media.category).length} uncategorized assets. Select cards to categorize them together.</p><select class="rounded-md border p-2 text-sm" bind:value={bulkCategory}><option>Logos</option><option>Banners</option><option>Flyers</option></select><button type="button" class="rounded-md border bg-white px-3 py-2 text-sm" disabled={!canManage || selectedIds.length === 0} on:click={applyBulkCategory}>Apply to {selectedIds.length} selected</button></div>{/if}
      {#if mediaTruncated}<p class="crm-ui-notice mt-4" role="status">More than {MEDIA_LIMIT} image records exist. Categories, counts, and search apply only to the loaded records.</p>{/if}
      {#if mediaLoadState === 'loading'}<div class="py-20 text-center text-sm" role="status">Loading media files…</div>
      {:else if mediaLoadState === 'error'}<div class="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{mediaLoadMessage}</div>
      {:else if filteredMedia.length === 0}<div class="mt-5"><EmptyState title="No media files" message="No matching active image record is available in the loaded scope." primaryLabel={searchQuery || activeCategory !== 'All' ? 'Clear filters' : canManage ? 'Upload image' : ''} onPrimary={() => { if (searchQuery || activeCategory !== 'All') { searchQuery = ''; activeCategory = 'All'; } else uploadOpen = true; }} /></div>
      {:else}<div class="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{#each filteredMedia as media (media.id)}<article class="group overflow-hidden rounded-lg border bg-white hover:shadow-md"><button type="button" aria-label={`Open details for ${media.name || 'unnamed media'}`} class="block w-full text-left" on:click={() => selected = { ...media }}><div class="h-36 overflow-hidden bg-gray-100">{#if safeMediaUrl(media.url)}<img src={safeMediaUrl(media.url)} alt={media.altText || media.name || 'Media name unavailable'} width="320" height="320" loading="lazy" decoding="async" class="h-full w-full object-cover" />{:else}<div class="flex h-full items-center justify-center text-sm text-gray-500">Preview unavailable</div>{/if}</div><div class="p-3"><p class="truncate text-sm font-medium" title={media.name || 'Media name unavailable'}>{media.name || 'Media name unavailable'}</p><p class="mt-1 text-xs text-gray-500">{media.width && media.height ? `${media.width} × ${media.height}` : 'Dimensions unavailable'} · {bytes(media.sizeBytes)}</p><p class="mt-1 text-xs"><span class="rounded bg-gray-100 px-2 py-0.5">{media.category || 'Category unavailable'}</span> · {usageByUrl.get(media.url)?.length || 0} uses</p></div></button><label class="flex items-center gap-2 border-t px-3 py-2 text-xs"><input type="checkbox" checked={selectedIds.includes(media.id)} disabled={!canManage} on:change={() => selectedIds = selectedIds.includes(media.id) ? selectedIds.filter((id) => id !== media.id) : [...selectedIds, media.id]} /> Select for bulk category</label></article>{/each}</div>{/if}
    </main>
  </div>
</div>
