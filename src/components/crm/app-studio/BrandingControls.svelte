<script lang="ts">
  import ImageFilePicker from '../ui/ImageFilePicker.svelte';

  export let primaryColor = '';
  export let secondaryColor = '';
  export let tertiaryColor = '';
  export let logoFile: File | null = null;
  export let logoValidationMessage = '';
  export let safeLogoPreviewUrl = '/logo.webp';
  export let disabled = false;
  export let canUndo = false;
  export let onCaptureUndo: () => void;
  export let onUndo: () => void;

</script>

<div class="space-y-5">
  <section aria-labelledby="brand-logo-heading">
    <div class="mb-2">
      <h3 id="brand-logo-heading" class="text-sm font-semibold text-gray-900">App logo</h3>
    </div>
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <ImageFilePicker
        inputId="studio-logo-image"
        label="Logo"
        currentUrl={safeLogoPreviewUrl}
        previewAlt="Logo preview"
        bind:selectedFile={logoFile}
        bind:validationMessage={logoValidationMessage}
        {disabled}
        compact={true}
        buttonLabel="Change logo"
      />
    </div>
  </section>

  <section aria-labelledby="brand-colors-heading">
    <div class="mb-2 flex items-center justify-between gap-3">
      <h3 id="brand-colors-heading" class="text-sm font-semibold text-gray-900">Brand colors</h3>
      <button type="button" class="crm-theme-link text-xs font-semibold disabled:text-gray-400" disabled={!canUndo || disabled} on:click={onUndo}>Undo</button>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <label class="rounded-lg border border-gray-200 bg-white p-2 text-xs font-medium text-gray-700">
          <span class="mb-2 block">Primary</span>
          <span class="flex items-center gap-2">
            <input
              type="color"
              bind:value={primaryColor}
              aria-label="Primary brand color"
              disabled={disabled}
              class="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
              on:focus={onCaptureUndo}
            />
            <input
              type="text"
              bind:value={primaryColor}
              aria-label="Primary brand color hex value"
              maxlength="7"
              pattern={'^#[0-9a-fA-F]{6}$'}
              disabled={disabled}
              class="min-w-0 w-full border-0 bg-transparent p-0 font-mono text-[11px] focus:outline-none"
              on:focus={onCaptureUndo}
            />
          </span>
      </label>
      <label class="rounded-lg border border-gray-200 bg-white p-2 text-xs font-medium text-gray-700">
          <span class="mb-2 block">Secondary</span>
          <span class="flex items-center gap-2">
            <input type="color" bind:value={secondaryColor} aria-label="Secondary brand color" disabled={disabled} class="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0" on:focus={onCaptureUndo} />
            <input type="text" bind:value={secondaryColor} aria-label="Secondary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={disabled} class="min-w-0 w-full border-0 bg-transparent p-0 font-mono text-[11px] focus:outline-none" on:focus={onCaptureUndo} />
          </span>
      </label>
      <label class="rounded-lg border border-gray-200 bg-white p-2 text-xs font-medium text-gray-700">
          <span class="mb-2 block">Accent</span>
          <span class="flex items-center gap-2">
            <input type="color" bind:value={tertiaryColor} aria-label="Tertiary brand color" disabled={disabled} class="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0" on:focus={onCaptureUndo} />
            <input type="text" bind:value={tertiaryColor} aria-label="Tertiary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={disabled} class="min-w-0 w-full border-0 bg-transparent p-0 font-mono text-[11px] focus:outline-none" on:focus={onCaptureUndo} />
          </span>
      </label>
    </div>
  </section>
</div>
