<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    IMAGE_FILE_ACCEPT,
    validateImageFile,
  } from '../../../lib/media/imageUpload';

  export let inputId: string;
  export let label = 'Image';
  export let currentUrl = '';
  export let previewAlt = 'Selected image preview';
  export let selectedFile: File | null = null;
  export let validationMessage = '';
  export let disabled = false;

  let selectedPreviewUrl = '';

  function releasePreview() {
    if (selectedPreviewUrl && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(selectedPreviewUrl);
    }
    selectedPreviewUrl = '';
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] || null;
    releasePreview();
    validationMessage = validateImageFile(file);
    selectedFile = file;
    if (!validationMessage && selectedFile && typeof URL.createObjectURL === 'function') {
      selectedPreviewUrl = URL.createObjectURL(selectedFile);
    }
    if (validationMessage) input.value = '';
  }

  $: safeCurrentUrl =
    typeof currentUrl === 'string'
    && (
      /^https:\/\/[^/]/i.test(currentUrl)
      || (currentUrl.startsWith('/') && !currentUrl.startsWith('//'))
    )
      ? currentUrl
      : '';
  $: previewUrl = selectedPreviewUrl || safeCurrentUrl;

  onDestroy(releasePreview);
</script>

<div class="space-y-2">
  <label for={inputId} class="crm-ui-label-caps">{label}</label>
  <div class="flex items-center gap-4">
    <div class="h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-gray-300 bg-slate-900">
      {#if previewUrl}
        <img
          src={previewUrl}
          alt={previewAlt}
          width="640"
          height="288"
          decoding="async"
          class="crm-ui-cover"
        />
      {:else}
        <div class="flex h-full w-full items-center justify-center px-2 text-center text-xs text-gray-400">No image</div>
      {/if}
    </div>
    <div class="min-w-0 flex-1">
      <input
        id={inputId}
        type="file"
        accept={IMAGE_FILE_ACCEPT}
        {disabled}
        on:change={handleFileChange}
        class="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
      />
      <p class="mt-1 text-xs text-gray-500">PNG, JPG, GIF, or WebP · 10 MB maximum.</p>
      {#if selectedFile && !validationMessage}
        <p class="mt-1 truncate text-xs font-medium text-gray-700">Selected: {selectedFile.name}</p>
      {/if}
    </div>
  </div>
  {#if validationMessage}
    <p class="text-sm text-red-700" role="alert">{validationMessage}</p>
  {/if}
</div>
