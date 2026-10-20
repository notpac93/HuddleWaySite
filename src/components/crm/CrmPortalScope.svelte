<script lang="ts">
  export let appName = '';
  export let activeTeam: { name?: string } | null = null;
  export let onExitTeam = () => {};
  export let mobile = false;
</script>

{#if mobile}
  {#if activeTeam}
    <div
      role="group"
      aria-label="Current team scope"
      class="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm lg:hidden"
    >
      <span class="min-w-0 truncate text-gray-700">Team: <strong>{activeTeam.name || 'Team'}</strong></span>
      <button
        type="button"
        class="portal-motion-color min-h-11 shrink-0 rounded px-2 font-semibold text-[var(--crm-brand-link)] hover:bg-[var(--crm-brand-surface)]"
        on:click={onExitTeam}
      >All teams</button>
    </div>
  {/if}
{:else}
  <div
    class="hidden min-w-0 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 lg:flex"
    aria-label="Current portal scope"
  >
    <span class="font-medium text-gray-500">Scope</span>
    <span class="max-w-40 truncate font-semibold text-gray-900">{appName}</span>
    {#if activeTeam}
      <span aria-hidden="true">/</span>
      <span class="max-w-40 truncate font-semibold text-[var(--crm-brand-link)]">{activeTeam.name || 'Team'}</span>
      <button
        type="button"
        class="portal-motion-color rounded px-1.5 py-1 font-semibold text-[var(--crm-brand-link)] hover:bg-[var(--crm-brand-surface)]"
        on:click={onExitTeam}
      >All teams</button>
    {/if}
  </div>
{/if}
