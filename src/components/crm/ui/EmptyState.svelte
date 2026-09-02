<script lang="ts">
  import Icon from './Icon.svelte';
  import type { PortalIconName } from '../../../lib/ui/portalIcons';

  export let icon: PortalIconName = 'info';
  export let title: string;
  export let message: string;
  export let primaryLabel = '';
  export let secondaryLabel = '';
  export let onPrimary: () => void = () => {};
  export let onSecondary: () => void = () => {};
</script>

<section class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
  <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[var(--crm-brand-link)] shadow-sm">
    <Icon name={icon} size={24} />
  </span>
  <h3 class="mt-4 text-base font-semibold text-gray-950">{title}</h3>
  <p class="mx-auto mt-1 max-w-xl text-sm leading-5 text-gray-600">{message}</p>
  {#if primaryLabel || secondaryLabel}
    <div class="mt-5 flex flex-wrap justify-center gap-3">
      {#if primaryLabel}
        <button type="button" class="crm-ui-button-primary min-h-11" on:click={onPrimary}>{primaryLabel}</button>
      {/if}
      {#if secondaryLabel}
        <button type="button" class="crm-ui-button-secondary min-h-11" on:click={onSecondary}>{secondaryLabel}</button>
      {/if}
    </div>
  {/if}
</section>
