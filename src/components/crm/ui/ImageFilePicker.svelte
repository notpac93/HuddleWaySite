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
  export let compact = false;
  export let buttonLabel = 'Choose image';

  export let photo = false;
  export let previewUrl = '';
  let fileInput: HTMLInputElement;
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
      || currentUrl.startsWith('blob:')
      || (currentUrl.startsWith('/') && !currentUrl.startsWith('//'))
    )
      ? currentUrl
      : '';
  $: previewUrl = selectedPreviewUrl || safeCurrentUrl;

  onDestroy(releasePreview);
</script>

<div class:space-y-2={!compact}>
  {#if photo}
    <div class="flex items-center justify-between"><span class="crm-ui-label">{label}</span>{#if selectedFile}<button type="button" class="text-sm text-[var(--crm-brand-link)]" {disabled} on:click={() => { selectedFile = null; releasePreview(); validationMessage = ''; if (fileInput) fileInput.value = ''; }}>Remove</button>{/if}</div>
    <input bind:this={fileInput} id={inputId} type="file" accept={IMAGE_FILE_ACCEPT} {disabled} on:change={handleFileChange} class="sr-only" aria-label={label} />
    <button type="button" {disabled} class="relative block aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-[var(--crm-brand-surface)] text-[var(--crm-brand-link)]" aria-label={previewUrl ? 'Change cover photo' : 'Add cover photo'} on:click={() => fileInput.click()}>
      {#if previewUrl}<img src={previewUrl} alt={previewAlt} width="640" height="360" class="h-full w-full object-cover" /><span class="absolute bottom-3 right-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-900">Change photo</span>
      {:else}<span class="flex flex-col items-center gap-2 p-5"><svg class="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-width="1.5" d="M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M16 8h.01" /></svg><span class="font-semibold">Add a cover photo</span><span class="text-xs">Click to upload</span></span>{/if}
    </button>
    <p class="text-xs text-gray-500">PNG, JPG, GIF, or WebP · 10 MB maximum.</p>
  {:else if compact}
    <div class="flex min-w-0 items-center gap-4">
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
          class="sr-only"
        />
        <label
          for={inputId}
          aria-disabled={disabled}
          class="crm-ui-button-secondary inline-flex max-w-full cursor-pointer items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-semibold"
          class:pointer-events-none={disabled}
          class:opacity-50={disabled}
        >{buttonLabel}</label>
        {#if selectedFile && !validationMessage}
          <p class="mt-2 truncate text-xs font-medium text-gray-700">{selectedFile.name}</p>
        {/if}
      </div>
    </div>
  {:else}
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
        class="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-[var(--crm-brand-surface)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--crm-brand-link)] hover:file:bg-[var(--crm-brand-surface-strong)] disabled:opacity-50"
      />
      <p class="mt-1 text-xs text-gray-500">PNG, JPG, GIF, or WebP · 10 MB maximum.</p>
      {#if selectedFile && !validationMessage}
        <p class="mt-1 truncate text-xs font-medium text-gray-700">Selected: {selectedFile.name}</p>
      {/if}
    </div>
  </div>
  {/if}
  {#if validationMessage}
    <p class="text-sm text-red-700" role="alert">{validationMessage}</p>
  {/if}
</div>
