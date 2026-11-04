<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RegistrationFormSection, RegistrationFormField } from '../../../lib/registration/registrationFormBuilder';
  export let section: RegistrationFormSection;
  export let editable = false;
  export let appearance: 'compact' | 'consumer' = 'compact';
  export let values: Record<string, string> = {};
  const dispatch = createEventDispatcher<{ edit: RegistrationFormField }>();
  function placeholder(field: RegistrationFormField) {
    return field.placeholder || (field.type === 'dropdown' || field.type === 'yes_no' ? 'Select' : field.type === 'date' ? 'MM / DD / YYYY' : field.type === 'email' ? 'name@example.com' : field.type === 'phone' ? 'Phone number' : field.id.includes('name') ? 'Full name' : 'Your answer');
  }
</script>

<div class="registration-fields" class:consumer-fields={appearance === 'consumer'}>
  {#each section.fields as field (field.id)}
    {#if editable}
      <button type="button" class="registration-field" aria-label={`Change ${field.label}`} aria-haspopup="dialog" on:click={() => dispatch('edit', field)}>
        <span class="field-label">{field.label}{#if appearance === 'consumer'}<span class:required={field.required}>{field.required ? 'Required' : 'Optional'}</span>{:else}{field.required ? ' *' : ''}{#if !field.required}<span>Optional</span>{/if}{/if}</span>
        <span class="field-placeholder">{placeholder(field)}</span>
      </button>
    {:else}
      <label class="registration-field">
        <span class="field-label">{field.label}{#if appearance === 'consumer'}<span class:required={field.required}>{field.required ? 'Required' : 'Optional'}</span>{:else}{field.required ? ' *' : ''}{#if !field.required}<span>Optional</span>{/if}{/if}</span>
        {#if field.type === 'dropdown' || field.type === 'yes_no'}
          <select aria-label={field.label} bind:value={values[field.id]}><option value="">Select</option>{#each field.type === 'yes_no' ? ['Yes', 'No'] : field.options || [] as option}<option value={option}>{option}</option>{/each}</select>
        {:else}
          <input aria-label={field.label} bind:value={values[field.id]} type={field.type === 'phone' ? 'tel' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'} placeholder={placeholder(field)} />
        {/if}
      </label>
    {/if}
  {/each}
</div>

<style>
  .registration-fields{display:grid;gap:10px}
  .registration-field{display:grid;gap:5px;align-content:center;width:100%;min-width:0;min-height:64px;padding:10px 12px;text-align:left;border:0;border-bottom:2px solid #dce3ed;border-radius:10px;background:#f4f6f9;color:#182235;font:inherit}
  button.registration-field:hover{background:var(--crm-brand-surface,#eaf2fc);border-bottom-color:var(--crm-brand-link,#2453cf)}
  .field-label{display:flex;gap:4px;color:#607087;font-size:12px;overflow-wrap:anywhere}.field-label>span{margin-left:auto}
  .field-placeholder{font-size:16px;color:#607087}
  input,select{display:block;min-width:0;width:100%;border:0;background:transparent;color:inherit;font:inherit;font-size:16px;padding:0;min-height:24px}
  input::placeholder{color:#607087;opacity:1}
  .consumer-fields{gap:18px}
  .consumer-fields .registration-field{padding:0;gap:6px;border:0;border-radius:0;background:transparent;min-height:0}
  .consumer-fields .field-label{font-size:14px;font-weight:600;color:#182235;align-items:center;gap:8px}
  .consumer-fields .field-label>span{font-size:11px;font-weight:600;color:#607087}
  .consumer-fields .field-label>span.required{color:var(--registration-preview-accent,#3296df)}
  .consumer-fields input,.consumer-fields select,.consumer-fields .field-placeholder{border:1px solid #d0d5df;border-radius:8px;background:white;min-height:46px;padding:10px 12px;font-size:16px;width:100%;color:#182235}
  .consumer-fields .field-placeholder{color:#607087;font-weight:400}
  .consumer-fields button:hover .field-placeholder{border-color:var(--registration-preview-accent,#3296df)}
  .consumer-fields button:hover{background:transparent}
</style>
