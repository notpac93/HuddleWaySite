<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../../lib/firebase';
  import {
    collection,
    documentId,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
  } from 'firebase/firestore';
  import { tenantIdStore } from '../../lib/authStore';

  type MediaFile = {
    id: string;
    name: string | null;
    url: string;
    category: string | null;
    createdAt: Date | null;
    size: string;
  };

  let mediaFiles: MediaFile[] = [];
  let unsubscribe = () => {};
  let activeCategory = 'All';
  const categories = ['All', 'Logos', 'Banners', 'Flyers', 'Uncategorized'];

  let searchQuery = '';
  let mediaLoadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let mediaLoadMessage = '';
  let mediaTruncated = false;
  let loadGeneration = 0;
  const MEDIA_LIMIT = 100;

  $: {
    if ($tenantIdStore) {
      const tenantId = $tenantIdStore;
      const generation = ++loadGeneration;
      unsubscribe();
      mediaFiles = [];
      mediaTruncated = false;
      mediaLoadState = 'loading';
      mediaLoadMessage = '';
      const q = query(
        collection(db, 'program_images'),
        where('tenantId', '==', tenantId),
        orderBy(documentId(), 'asc'),
        limit(MEDIA_LIMIT + 1),
      );
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (generation !== loadGeneration || $tenantIdStore !== tenantId) return;
          mediaTruncated = snapshot.docs.length > MEDIA_LIMIT;
          mediaFiles = snapshot.docs.slice(0, MEDIA_LIMIT).map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              name:
                typeof (d.fileName || d.name) === 'string'
                && String(d.fileName || d.name).trim()
                  ? String(d.fileName || d.name).trim()
                  : null,
              url: d.imageUrl || d.url || '',
              category:
                typeof d.category === 'string' && d.category.trim()
                  ? d.category.trim()
                  : null,
              createdAt: d.uploadedAt?.toDate
                ? d.uploadedAt.toDate()
                : (d.createdAt?.toDate ? d.createdAt.toDate() : null),
              size: d.size || 'Size unavailable'
            };
          });
          mediaLoadState = 'ready';
        },
        () => {
          if (generation !== loadGeneration || $tenantIdStore !== tenantId) return;
          console.error('Media files could not be loaded.');
          mediaFiles = [];
          mediaLoadState = 'error';
          mediaLoadMessage = 'Media files could not be loaded. Check your access and try again.';
        },
      );
    } else {
      loadGeneration += 1;
      unsubscribe();
      mediaFiles = [];
      mediaLoadState = 'idle';
      mediaLoadMessage = '';
    }
  }

  $: filteredMedia = mediaFiles.filter((media) => {
    const matchesCategory =
      activeCategory === 'All'
      || (activeCategory === 'Uncategorized' && !media.category)
      || media.category === activeCategory;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return matchesCategory && (
      !normalizedQuery
      || (media.name || '').toLowerCase().includes(normalizedQuery)
      || (media.category || '').toLowerCase().includes(normalizedQuery)
    );
  });

  onMount(() => {
    return () => {
      loadGeneration += 1;
      unsubscribe();
    };
  });

  function safeMediaUrl(value: string) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed.toString() : '';
    } catch {
      return '';
    }
  }
</script>

<div class="h-full flex flex-col p-6 space-y-6 overflow-y-auto bg-gray-50">
  <div class="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <div>
      <h2 class="crm-ui-page-title">Media Library</h2>
      <p class="text-sm text-gray-500 mt-1">Review program image records.</p>
    </div>
  </div>

  <div class="flex flex-1 flex-col gap-4 overflow-hidden md:flex-row md:space-x-6 md:gap-0">
    <!-- Sidebar -->
    <div class="w-full flex-shrink-0 md:w-64">
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Categories</h3>
        <nav class="space-y-1">
          {#each categories as category}
            <button
              class="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors {activeCategory === category ? 'crm-theme-selected' : 'text-gray-700 hover:bg-gray-50'}"
              on:click={() => activeCategory = category}
            >
              {category}
              <span class="float-right text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {category === 'All' ? mediaFiles.length : mediaFiles.filter(m => category === 'Uncategorized' ? !m.category : m.category === category).length}
              </span>
            </button>
          {/each}
        </nav>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-y-auto">
      <div class="flex flex-col gap-3 mb-6 sm:flex-row sm:justify-between sm:items-center">
        <h3 class="crm-ui-subtitle">{activeCategory} Media</h3>
        <div class="relative w-full sm:w-64">
          <div class="crm-ui-search-icon">
            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <label>
            <span class="sr-only">Search media files</span>
            <input
            type="search"
            bind:value={searchQuery}
            class="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--crm-brand-border)]"
            placeholder="Search files..."
            />
          </label>
        </div>
      </div>
      {#if mediaTruncated}
        <p class="crm-ui-notice" role="status">
          More than {MEDIA_LIMIT} image records exist. Categories, counts, and search apply only to the loaded records.
        </p>
      {/if}

      {#if mediaLoadState === 'loading'}
        <div class="py-20 text-center text-sm text-gray-600" role="status">
          Loading media files…
        </div>
      {:else if mediaLoadState === 'error'}
        <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {mediaLoadMessage}
        </div>
      {:else if filteredMedia.length === 0}
        <div class="text-center py-20 border-2 border-dashed border-gray-200 rounded-lg">
          <svg class="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          <h3 class="text-sm font-medium text-gray-900">No media files</h3>
          <p class="mt-1 text-sm text-gray-500">No matching image record is available in the loaded scope.</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {#each filteredMedia as media (media.id)}
            <div class="group relative rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow bg-white">
              <div class="aspect-w-1 aspect-h-1 w-full overflow-hidden bg-gray-100 h-40">
                {#if safeMediaUrl(media.url)}
                  <img
                    src={safeMediaUrl(media.url)}
                    alt={media.name || 'Media name unavailable'}
                    width="320"
                    height="320"
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-cover object-center group-hover:opacity-75"
                  />
                {:else}
                  <div class="flex h-full items-center justify-center">
                    <svg class="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  </div>
                {/if}
              </div>
              <div class="p-3">
                <p class="text-sm font-medium text-gray-900 truncate" title={media.name || 'Media name unavailable'}>{media.name || 'Media name unavailable'}</p>
                <div class="flex justify-between items-center mt-1">
                  <p class="crm-ui-hint-xs">{media.size}</p>
                  <p class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{media.category || 'Category unavailable'}</p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
