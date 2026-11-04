<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import RegistrationFormList from './RegistrationFormList.svelte';
  export let forms: any[] = [];
  export let isLoadingForms = true;
  export let activeTab = 'Active';
  export let error = '';
  const dispatch = createEventDispatcher();
  $: filteredForms = forms.filter(form => {
    const status = String(form.rawStatus || form.status || '').trim().toLowerCase();
    return activeTab === 'Active' ? ['active','open'].includes(status) : activeTab === 'Retired' ? ['archived','closed'].includes(status) : !['active','open','archived','closed'].includes(status);
  });
</script>
<RegistrationFormList forms={filteredForms} loading={isLoadingForms} {error} on:select={event => dispatch('select',event.detail)} />
