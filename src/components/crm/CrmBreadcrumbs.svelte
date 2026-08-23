<script lang="ts">
  type BreadcrumbItem = {
    label: string;
    current?: boolean;
    onSelect?: () => void;
  };

  export let items: BreadcrumbItem[] = [];
</script>

<nav class="crm-ui-shell-breadcrumb" aria-label="Breadcrumb">
  {#each items as item, index}
    {#if index > 0}
      <svg class="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    {/if}
    {#if item.current || !item.onSelect}
      <span
        class="truncate {item.current ? 'text-base font-semibold text-gray-900 sm:text-lg' : 'font-medium'}"
        aria-current={item.current ? 'page' : undefined}
      >{item.label}</span>
    {:else}
      <button
        type="button"
        class="hidden truncate font-medium text-gray-600 transition-colors hover:text-[#1a56db] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a56db] sm:inline"
        on:click={item.onSelect}
      >{item.label}</button>
    {/if}
  {/each}
</nav>
