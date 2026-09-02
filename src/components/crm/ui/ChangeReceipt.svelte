<script lang="ts">
  import Icon from './Icon.svelte';

  export let status: 'success' | 'partial' | 'error' = 'success';
  export let title: string;
  export let message: string;
  export let reference = '';
  export let retryLabel = '';
  export let onRetry: () => void = () => {};
  export let onDismiss: () => void = () => {};

  $: tone = status === 'success' ? 'success' : status === 'partial' ? 'warning' : 'danger';
  $: icon = status === 'success' ? 'check' : status === 'partial' ? 'warning' : 'error';
</script>

<section class="rounded-lg border p-4 {tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-red-200 bg-red-50 text-red-950'}" role={status === 'error' ? 'alert' : 'status'}>
  <div class="flex items-start gap-3">
    <Icon name={icon} size={20} className="mt-0.5 shrink-0" />
    <div class="min-w-0 flex-1">
      <h3 class="text-sm font-semibold">{title}</h3>
      <p class="mt-1 text-sm leading-5">{message}</p>
      {#if reference}<p class="mt-2 break-all text-xs font-medium opacity-75">Reference: {reference}</p>{/if}
      <div class="mt-3 flex flex-wrap gap-2">
        {#if retryLabel}<button type="button" class="crm-ui-button-secondary bg-white" on:click={onRetry}>{retryLabel}</button>{/if}
        <button type="button" class="rounded-md px-3 py-2 text-sm font-semibold hover:bg-white/60" on:click={onDismiss}>Dismiss</button>
      </div>
    </div>
  </div>
</section>
