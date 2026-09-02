<script lang="ts">
  import Icon from './Icon.svelte';

  export let tone: 'info' | 'success' | 'warning' | 'danger' = 'info';
  export let title: string;
  export let message = '';
  export let actionLabel = '';
  export let onAction: () => void = () => {};

  const toneClass = {
    info: 'border-[var(--portal-color-info-border)] bg-[var(--portal-color-info-bg)] text-[var(--portal-color-info-text)]',
    success: 'border-[var(--portal-color-success-border)] bg-[var(--portal-color-success-bg)] text-[var(--portal-color-success-text)]',
    warning: 'border-[var(--portal-color-warning-border)] bg-[var(--portal-color-warning-bg)] text-[var(--portal-color-warning-text)]',
    danger: 'border-[var(--portal-color-danger-border)] bg-[var(--portal-color-danger-bg)] text-[var(--portal-color-danger-text)]',
  };
  const toneIcon = {
    info: 'info',
    success: 'check',
    warning: 'warning',
    danger: 'error',
  } as const;
</script>

<section
  class="flex items-start gap-3 rounded-lg border p-4 {toneClass[tone]}"
  role={tone === 'danger' ? 'alert' : 'status'}
>
  <Icon name={toneIcon[tone]} size={20} className="mt-0.5 shrink-0" />
  <div class="min-w-0 flex-1">
    <h3 class="text-sm font-semibold">{title}</h3>
    {#if message}<p class="mt-1 text-sm leading-5 opacity-90">{message}</p>{/if}
  </div>
  {#if actionLabel}
    <button
      type="button"
      class="portal-motion-color min-h-9 shrink-0 rounded-md border border-current/30 bg-white/70 px-3 text-sm font-semibold hover:bg-white"
      on:click={onAction}
    >{actionLabel}</button>
  {/if}
</section>
