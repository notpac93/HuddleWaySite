<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { RegistrationService } from '../../../lib/services/RegistrationService';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import CreateRegistrationForm from './CreateRegistrationForm.svelte';
  import RegistrationFormList from './RegistrationFormList.svelte';
  import SuccessToast from '../ui/SuccessToast.svelte';
  export let onClose: () => void;
  let forms: any[] = [];
  let localForms: any[] = [];
  let loading = true;
  let message = '';
  let search = '';
  let editorOpen = false;
  let editing: any = null;
  let receipt = '';
  let scope = '';
  let stop = () => {};
  $: if (($tenantIdStore || '') !== scope) {
    scope = $tenantIdStore || ''; stop(); forms = []; localForms = []; loading = true; message = ''; editorOpen = false;
    if (scope) { const tenant = scope; stop = RegistrationService.subscribeToForms(tenant, rows => {
      if (scope !== tenant) return;
      const seen = new Set(rows.map(row => row.id)); localForms = localForms.filter(row => !seen.has(row.id));
      forms = [...localForms, ...rows]; loading = false; message = '';
    }, () => { if (scope === tenant) { loading = false; message = 'Saved forms could not be loaded.'; } }); }
    else { loading = false; message = 'Select an organization to view saved forms.'; }
  }
  onDestroy(() => stop());
  $: visible = forms.filter(form => String(form.title || form.name || '').toLowerCase().includes(search.trim().toLowerCase()));
  function saved(event: CustomEvent) {
    const form = { ...event.detail, rawStatus: event.detail.status };
    localForms = [form, ...localForms.filter(row => row.id !== form.id)];
    forms = [form, ...forms.filter(row => row.id !== form.id)]; editorOpen = false; receipt = 'Registration form saved';
  }
</script>

<div class="library-overlay" role="presentation">
  <div class="library-panel" role="dialog" aria-modal="true" aria-label="Saved registration forms" tabindex="-1" use:modalFocus={{ onEscape: () => { if (!editorOpen) onClose(); } }}>
    <div inert={editorOpen}>
      <header><h2>Saved forms</h2><button type="button" aria-label="Close saved forms" on:click={onClose}>×</button></header>
      <div class="library-tools"><label><span class="sr-only">Search saved forms</span><input type="search" placeholder="Search forms" bind:value={search} /></label><button type="button" class="new-form" on:click={() => { editing = null; editorOpen = true; }}>New form</button></div>
      <RegistrationFormList forms={visible} {loading} error={message} emptyMessage={search ? 'No matching forms.' : 'No saved forms yet.'} on:select={event => { editing = event.detail; editorOpen = true; }} />
    </div>
  </div>
</div>
{#if editorOpen}<CreateRegistrationForm form={editing} on:success={saved} on:cancel={() => editorOpen = false} />{/if}
{#if receipt}{#key receipt}<SuccessToast title={receipt} onDismiss={() => receipt = ''} />{/key}{/if}
<style>
  .library-overlay{position:fixed;inset:0;z-index:50;background:#15243a66;display:flex;align-items:center;justify-content:center;padding:12px}.library-panel{background:white;color:#182235;border-radius:16px;padding:20px 16px;width:min(100%,520px);max-height:calc(100dvh - 24px);overflow-y:auto;font:16px/1.4 Roboto,Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h2{font-size:24px;font-weight:600;margin:0}header button{width:44px;height:44px;background:none;border:0;font-size:26px;color:#607087}.library-tools{display:flex;gap:10px;margin:20px 0}.library-tools label{flex:1;min-width:0}input{width:100%;min-width:0;min-height:46px;border:1px solid #dce3ed;border-radius:10px;padding:10px 12px;font:inherit}.new-form{border:0;background:var(--crm-brand-control,#003366);color:var(--crm-on-primary,white);border-radius:10px;padding:10px 14px;font:inherit;white-space:nowrap}
</style>
