<script lang="ts">
  import type { CrmComponentDefinition, CrmPageComponent } from '../../../lib/api/BackendApi';
  import { fieldLabel, validateComponent } from './componentStudioDraft';
  import StructuredCollectionEditor from './StructuredCollectionEditor.svelte';
  import { wordingLabel, wordingLimit, textRemovalAllowed } from './sectionEditing';

  export let component: CrmPageComponent;
  export let definition: CrmComponentDefinition | undefined;
  export let adding = false;
  export let busy = false;
  export let sectionMode = false;
  export let textOnly = false;
  export let onChange: (fieldId: string, value: unknown) => void;
  export let onFieldFocus: (fieldId: string) => void;
  export let onToggleVisibility: () => void;
  export let onRemove: () => void;
  export let onConfirmAdd: () => void;
  export let onCancel: () => void;

  $: issues = validateComponent(component, definition);
  $: fields = (definition?.fields || []).filter((field) => !sectionMode ||
    !['registrationEventId', 'eventIds', 'dataBindingSource', 'dataBindingMode', 'dataBindingFallback', 'dataBindingSort', 'teamBindingMode', 'teamFilter'].includes(field.id))
    .filter((field) => !textOnly || ['text', 'multiline_text', 'string_list', 'items', 'profiles', 'highlights'].includes(field.type))
    .map((field) => sectionMode && ['text', 'multiline_text'].includes(field.type)
    ? { ...field, label: wordingLabel(component, field), maxLength: wordingLimit(component, field) } : field);
  const removedText = new Map<string, string>();
  function removeText(fieldId: string) {
    removedText.set(`${component.id}:${fieldId}`, inputValue(fieldId));
    onChange(fieldId, '');
  }
  function restoreText(fieldId: string) {
    onChange(fieldId, removedText.get(`${component.id}:${fieldId}`) || '');
  }

  export function focusField(fieldId: string) {
    const input = document.getElementById(`component-field-${component.id}-${fieldId}`);
    input?.focus();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.select();
  }

  function inputValue(fieldId: string) {
    const value = component.content[fieldId];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }

  function stringListValue(fieldId: string) {
    const value = component.content[fieldId];
    return Array.isArray(value) ? value.map(String).join('\n') : '';
  }
</script>

<section class:text-only={textOnly} aria-labelledby="component-editor-title" class="min-w-0 rounded-xl border border-gray-200 bg-white p-5">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="crm-theme-link text-xs font-semibold uppercase tracking-wide">{adding ? 'Preview before adding' : 'Editing component'}</p>
      <h3 id="component-editor-title" class="mt-1 text-lg font-semibold text-gray-950">{component.label}</h3>
      {#if !sectionMode}<p class="mt-1 text-sm text-gray-600">{definition?.previewSpec.description || 'This legacy component is preserved until a supported migration is available.'}</p>{/if}
    </div>
    {#if !sectionMode || adding}<button type="button" class="rounded-md border px-3 py-2 text-sm" on:click={onCancel}>{adding ? 'Back' : 'Close'}</button>{/if}
  </div>

  {#if issues.length > 0}
    <div class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
      <p class="font-semibold">Needs attention</p>
      <ul class="mt-1 list-disc pl-5">{#each issues as issue}<li>{issue.message}</li>{/each}</ul>
    </div>
  {/if}

  {#if definition}
    <div class="field-list mt-5 space-y-4">
      {#each fields as field (field.id)}
        <div>
          {#if sectionMode && textRemovalAllowed(field)}
            <div class="float-right ml-3"><button type="button" class="text-sm underline" disabled={busy} on:click={() => inputValue(field.id) ? removeText(field.id) : restoreText(field.id)}>{inputValue(field.id) ? 'Remove text' : 'Restore text'}</button></div>
          {/if}
          {#if field.type === 'bool'}
            <label class="flex items-center gap-3 text-sm font-medium text-gray-800">
              <input id={`component-field-${component.id}-${field.id}`} type="checkbox" checked={component.content[field.id] === true} disabled={busy} on:focus={() => onFieldFocus(field.id)} on:change={(event) => onChange(field.id, event.currentTarget.checked)} />
              {field.label || fieldLabel(field.id)}
            </label>
          {:else if field.options?.length}
            <label for={`component-field-${component.id}-${field.id}`} class="block text-sm font-medium text-gray-800">{field.label || fieldLabel(field.id)}</label>
            <select id={`component-field-${component.id}-${field.id}`} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" value={inputValue(field.id)} disabled={busy} on:focus={() => onFieldFocus(field.id)} on:change={(event) => onChange(field.id, event.currentTarget.value)}>
              {#each field.options as option}<option value={option}>{fieldLabel(option)}</option>{/each}
            </select>
          {:else if field.type === 'multiline_text'}
            <label for={`component-field-${component.id}-${field.id}`} class="block text-sm font-medium text-gray-800">{field.label || fieldLabel(field.id)}</label>
            <textarea id={`component-field-${component.id}-${field.id}`} class="mt-1 block min-h-28 w-full rounded-md border border-gray-300 px-3 py-2" value={inputValue(field.id)} maxlength={field.maxLength} required={field.required} disabled={busy} on:focus={() => onFieldFocus(field.id)} on:input={(event) => onChange(field.id, event.currentTarget.value)}></textarea>
          {:else if field.type === 'string_list'}
            <label for={`component-field-${component.id}-${field.id}`} class="block text-sm font-medium text-gray-800">{field.label || fieldLabel(field.id)} <span class="font-normal text-gray-500">(one per line)</span></label>
            <textarea id={`component-field-${component.id}-${field.id}`} class="mt-1 block min-h-28 w-full rounded-md border border-gray-300 px-3 py-2" value={stringListValue(field.id)} disabled={busy} on:focus={() => onFieldFocus(field.id)} on:input={(event) => onChange(field.id, event.currentTarget.value.split('\n').map((item) => item.trim()).filter(Boolean))}></textarea>
          {:else if ['items', 'profiles', 'highlights'].includes(field.type)}
            <div id={`component-field-${component.id}-${field.id}`}>
              <StructuredCollectionEditor fieldId={field.id} label={field.label || fieldLabel(field.id)} type={field.type} value={component.content[field.id]} disabled={busy} onFocus={() => onFieldFocus(field.id)} onChange={(value) => onChange(field.id, value)} />
            </div>
          {:else if field.type === 'image'}
            <div id={`component-field-${component.id}-${field.id}`} class="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p class="text-sm font-medium text-gray-800">{field.label || fieldLabel(field.id)}</p>
              <p class="mt-1 text-xs text-gray-600">Existing media stays unchanged. Replace it from Media after private component uploads are connected.</p>
            </div>
          {:else}
            <label for={`component-field-${component.id}-${field.id}`} class="block text-sm font-medium text-gray-800">{field.label || fieldLabel(field.id)}</label>
            <input id={`component-field-${component.id}-${field.id}`} type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" value={inputValue(field.id)} maxlength={field.maxLength} required={field.required} disabled={busy} on:focus={() => onFieldFocus(field.id)} on:input={(event) => onChange(field.id, field.type === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value)} />
          {/if}
          {#if sectionMode && ['text', 'multiline_text'].includes(field.type) && !field.options?.length && field.maxLength && inputValue(field.id).length >= Math.ceil(field.maxLength * 0.8)}
            <p aria-live="polite" class="mt-1 text-xs text-gray-600">{inputValue(field.id).length >= field.maxLength ? 'Character limit reached' : `${field.maxLength - inputValue(field.id).length} characters left`}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="mt-6 flex flex-wrap gap-2 border-t pt-4">
    {#if adding}
      <button type="button" class="crm-ui-button-primary" disabled={busy || issues.length > 0} on:click={onConfirmAdd}>Add to page</button>
    {:else}
      <button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={onToggleVisibility}>{component.content.hideSection === true || !component.isVisible || !component.enabled ? 'Restore section' : 'Hide from family app'}</button>
      {#if component.type !== 'hero_section' || component.content.hideSection !== true}<button type="button" class="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-50" disabled={busy} on:click={onRemove}>Remove from page</button>{/if}
    {/if}
  </div>
</section>

<style>
  .text-only { border: 0; border-radius: 0; padding: 16px 20px; }
  .text-only > div:first-child { display: none; }
  .text-only .field-list { margin-top: 0; }
  .text-only :global(textarea) { min-height: 72px; }
</style>
