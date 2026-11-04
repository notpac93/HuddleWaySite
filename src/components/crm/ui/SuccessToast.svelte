<script lang="ts">
  import { toast } from './toast';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  export let title: string;
  export let onDismiss: () => void;
  let timer: ReturnType<typeof setTimeout>;
  let mounted = false;
  function pause() { clearTimeout(timer); }
  function resume() { pause(); if (mounted) timer = setTimeout(onDismiss, 5000); }
  onMount(() => { mounted = true; resume(); return () => { mounted = false; pause(); }; });
</script>

<div use:toast={{persistent: true}} class="success-toast" role="status" aria-live="polite" aria-atomic="true" on:mouseenter={pause} on:mouseleave={resume} on:focusin={pause} on:focusout={resume}>
  <span class="success-mark"><Icon name="check" size={20} /></span>
  <span class="success-title">{title}</span>
  <button type="button" aria-label="Dismiss success notification" on:click={onDismiss}>×</button>
</div>

<style>
  .success-toast{position:fixed;top:calc(env(safe-area-inset-top,0px) + 16px);right:16px;z-index:90;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:6px 6px 6px 14px;border:1px solid #a7e0c1;border-radius:12px;background:#f0fdf5;color:#14532d;box-shadow:0 6px 24px #153d2426;animation:toast-in .18s ease-out}
  .success-mark{display:grid;place-items:center;flex-shrink:0}.success-title{font-size:14px;font-weight:500;overflow-wrap:anywhere}
  button{border:0;border-radius:8px;background:transparent;color:inherit;min-width:44px;min-height:44px;font-size:22px;line-height:1}button:hover{background:#dcfce7}
  @keyframes toast-in{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}@media(prefers-reduced-motion:reduce){.success-toast{animation:none}}
</style>
