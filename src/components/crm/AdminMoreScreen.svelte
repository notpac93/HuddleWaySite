<script lang="ts">
  import Icon from './ui/Icon.svelte';
  import type { PortalIconName } from '../../lib/ui/portalIcons';

  // The shell supplies only destinations authorized for the current account.
  export let tabs: { name: string; label?: string; icon: PortalIconName }[] = [];
  export let programs: { id: string; name: string }[] = [];
  export let currentProgram = '';
  export let onNavigate: (name: string) => void;
  export let onSwitchProgram: (id: string) => void;
  export let onSignOut: () => void;
</script>

<section class="more-screen" aria-labelledby="admin-more-title">
  <h2 id="admin-more-title">More</h2>
  <nav class="destinations" aria-label="More sections">
    {#each tabs as tab (tab.name)}
      <button type="button" on:click={() => onNavigate(tab.name)}>
        <span class="tool-icon"><Icon name={tab.icon} size={24} /></span>
        <span>{tab.label || tab.name}</span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
      </button>
    {/each}
  </nav>
  <div class="account-actions">
    {#if programs.length > 1}
      <label for="more-program">Switch program</label>
      <select id="more-program" value={currentProgram} on:change={(event) => { const selected = event.currentTarget.value; event.currentTarget.value = currentProgram; onSwitchProgram(selected); }}>
        {#each programs as program}<option value={program.id}>{program.name}</option>{/each}
      </select>
    {/if}
    <button type="button" class="sign-out" on:click={onSignOut}>Sign out</button>
  </div>
</section>

<style>
  .more-screen { flex: 1; min-height: 0; overflow-y: auto; padding: 24px 16px; background: #f7f8fa; }
  h2 { margin: 0 0 20px; font-size: 1.5rem; line-height: 1.3; font-weight: 700; color: #111827; }
  .destinations { overflow: hidden; border: 1px solid #e5e7eb; border-radius: 20px; background: white; }
  .destinations button { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 66px; padding: 12px 16px; text-align: left; font: inherit; font-size: .95rem; font-weight: 600; color: #172536; background: transparent; border: 0; }
  .destinations button + button { border-top: 1px solid #edf0f3; }
  .destinations button:hover { background: var(--crm-brand-surface); }
  .tool-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; color: var(--crm-brand-link); background: var(--crm-brand-surface); }
  .chevron { margin-left: auto; color: #94a3b8; }
  .account-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-top: 24px; }
  label { font-size: .875rem; font-weight: 600; }
  select { width: 100%; min-height: 44px; padding: 10px; border: 1px solid #d1d5db; border-radius: 12px; background: white; }
  .sign-out { min-height: 44px; padding: 8px 12px; border: 0; background: transparent; color: #475569; font: inherit; font-size: .875rem; font-weight: 600; }
  button:focus-visible, select:focus-visible { outline: 2px solid var(--crm-brand-focus); outline-offset: -3px; }
</style>
