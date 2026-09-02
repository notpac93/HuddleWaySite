<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from './Icon.svelte';

  export let title: string;
  export let support = '';
  export let onClose: () => void = () => {};
</script>

<div class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="portal-drawer-title">
  <button type="button" class="absolute inset-0 bg-slate-950/50" aria-label="Close details" tabindex="-1" on:click={onClose}></button>
  <aside
    class="portal-drawer-enter relative flex h-full w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-2xl"
    tabindex="-1"
    use:modalFocus={{ onEscape: onClose, initialFocusSelector: '[data-drawer-close]' }}
  >
    <header class="flex items-start gap-4 border-b border-gray-200 px-5 py-4">
      <div class="min-w-0 flex-1">
        <h2 id="portal-drawer-title" class="text-lg font-semibold text-gray-950">{title}</h2>
        {#if support}<p class="mt-1 text-sm text-gray-600">{support}</p>{/if}
      </div>
      <button
        type="button"
        class="portal-motion-color flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
        aria-label="Close details"
        data-drawer-close
        on:click={onClose}
      ><Icon name="close" size={20} /></button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-5"><slot /></div>
    <div class="border-t border-gray-200 bg-gray-50 px-5 py-4"><slot name="actions" /></div>
  </aside>
</div>
