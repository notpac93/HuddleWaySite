<script lang="ts">
  export let state: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  export let idleText: string = 'Submit';
  export let loadingText: string = 'Saving...';
  export let successText: string = 'Success!';
  export let errorText: string = 'Error';
  export let disabled: boolean = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';

  // Custom classes passed to the component
  let className: string = '';
  export { className as class };
  let styleValue: string = '';
  export { styleValue as style };

  // Helper to append status-based styling dynamically, or just rely on the parent's classes for bg color
  // Most parent components are passing their own colors (e.g. bg-[var(--crm-brand-control)], bg-[var(--crm-brand-control)])
  // When in success or error state, we might want to override the color.
  $: computedClass = `${className} relative inline-flex items-center justify-center transition-colors duration-200 ` +
    (state === 'success' ? '!bg-emerald-600 hover:!bg-emerald-700 !border-emerald-600 text-white ' : '') +
    (state === 'error' ? '!bg-red-600 hover:!bg-red-700 !border-red-600 text-white ' : '');
</script>

<button
  {type}
  disabled={disabled || state === 'loading' || state === 'success'}
  class={computedClass}
  style={styleValue}
  on:click
>
  {#if state === 'loading'}
    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    {loadingText}
  {:else if state === 'success'}
    <svg class="-ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
    </svg>
    {successText}
  {:else if state === 'error'}
    <svg class="-ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    {errorText}
  {:else}
    <!-- Slot fallback or idleText -->
    <slot>{idleText}</slot>
  {/if}
</button>
