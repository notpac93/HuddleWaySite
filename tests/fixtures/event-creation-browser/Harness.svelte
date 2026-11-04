<script>
  import SuccessToast from '../../../src/components/crm/ui/SuccessToast.svelte';
  import RegistrationManager from '../../../src/components/crm/registration/RegistrationManager.svelte';
  let view = new URLSearchParams(location.search).get('view') === 'forms' ? 'forms' : 'events';
  import Events from '../../../src/components/crm/EventScheduler.svelte';
  import CreateRegistrationForm from '../../../src/components/crm/registration/CreateRegistrationForm.svelte';
  let showForm = false;
  let receipt = '';
  let editing = null;
</script>
<div class="crm-theme-default-host local-preview">
  <header><strong>HuddleWay Program</strong><button type="button" on:click={() => view = view === 'forms' ? 'events' : 'forms'}>{view === 'forms' ? 'Schedule' : 'Registration forms'}</button></header><p class="preview-label">Local preview · sample data</p>
  <main>
    {#if receipt}{#key receipt}<SuccessToast title={receipt} onDismiss={() => receipt = ''} />{/key}{/if}
    {#if view === 'forms'}<RegistrationManager />{:else}<Events />{/if}

  </main>
  {#if showForm}<CreateRegistrationForm previewEvent={{ title: 'Basketball Skill Lab', date: 'Nov 3, 2026, 6:00 PM', price: '$35.00' }} form={editing} on:cancel={() => showForm = false} on:success={e => { receipt = editing ? 'Registration form updated' : 'Registration form saved'; showForm = false; }} />{/if}
</div>
<style>
  .local-preview{font-family:Roboto,Arial,sans-serif;background:#f8fafc;min-height:100vh;color:#182235}header{background:white;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:18px;border-bottom:1px solid #dce3ed}.preview-label{font-size:12px;color:#607087;text-align:right;margin:8px 18px}main{padding:18px;max-width:1100px;margin:auto}.actions{display:flex;align-items:center;gap:18px;margin-bottom:16px}button,a{font:inherit;font-size:16px}button{background:white;border:1px solid #dce3ed;border-radius:10px;padding:10px 14px}h2{font-size:20px;margin:20px 0 12px}section button{margin:0 8px 8px 0}
</style>
