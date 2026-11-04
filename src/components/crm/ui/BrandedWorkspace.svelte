<script lang="ts">
  import SectionEyebrow from './SectionEyebrow.svelte';
  export let title: string;
  export let eyebrow = '';
  export let support = '';
  export let panel = true;
  export let headingLevel: 1 | 2 = 2;
</script>

<div class="crm-branded-workspace crm-auth-shell">
  <div class="crm-auth-watermark" aria-hidden="true"></div>
  <header class="crm-branded-header">
    <div class="crm-branded-heading">
      <SectionEyebrow label={eyebrow} />
      <svelte:element this={headingLevel === 1 ? 'h1' : 'h2'}>{title}</svelte:element>
      {#if support}<p class="crm-branded-support">{support}</p>{/if}
    </div>
    {#if $$slots.actions}<div class="crm-branded-actions"><slot name="actions" /></div>{/if}
  </header>
  {#if $$slots.navigation}<nav class="crm-branded-navigation" aria-label={`${title} views`}><slot name="navigation" /></nav>{/if}
  <div class="crm-branded-body" class:crm-branded-panel={panel}><slot /></div>
</div>

<style>
  .crm-branded-workspace{position:relative;isolation:isolate;display:flex;flex:1;flex-direction:column;gap:1.25rem;width:100%;height:100%;min-width:0;min-height:0;overflow-y:auto;padding:clamp(1rem,3vw,2rem)}
  .crm-branded-workspace> *{position:relative;flex-shrink:0;margin-block:0}
  .crm-branded-workspace>.crm-auth-watermark{position:absolute}
  .crm-branded-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;color:white}
  .crm-branded-heading{min-width:0}
  .crm-branded-heading :is(h1,h2){margin:.25rem 0 0;font-size:clamp(1.65rem,3vw,2.1rem);font-weight:800;line-height:1.2;letter-spacing:-.04em;overflow-wrap:anywhere}
  .crm-branded-support{margin-top:.5rem;color:var(--crm-on-sidebar-muted);font-size:.875rem;overflow-wrap:anywhere}
  .crm-branded-actions{display:flex;flex-shrink:0;flex-wrap:wrap;align-items:center;gap:.5rem}
  .crm-branded-actions :global(.crm-auth-button-secondary){width:auto;gap:.5rem}
  .crm-branded-body{display:flex;flex-direction:column;gap:1.25rem;min-width:0}
  .crm-branded-body> :global(*){margin-block:0;min-width:0}
  .crm-branded-workspace :global(.crm-branded-panel){min-width:0;padding:clamp(1rem,3vw,1.5rem);border:1px solid rgba(255,255,255,.62);border-radius:1.25rem;background:rgba(255,255,255,.97);color:#172b40;box-shadow:0 20px 45px rgba(3,15,40,.2)}
  .crm-branded-workspace :global(.crm-branded-panel--flush){padding:0;overflow:hidden}
  .crm-branded-body :global(input:not([type=checkbox]):not([type=radio]):not([type=file])),.crm-branded-body :global(select),.crm-branded-body :global(textarea){max-width:100%;border-radius:.6rem;color:#172b40;font-family:inherit}
  .crm-branded-body :global(input[type=search]){min-height:44px;border-color:#dce2e9;background:#f4f6f8}
  .crm-branded-body :global(.crm-ui-empty){border:0;background:transparent;box-shadow:none}
  .crm-branded-workspace :global(button:focus-visible),.crm-branded-workspace :global(a:focus-visible){outline:3px solid var(--crm-brand-secondary);outline-offset:3px}
  .crm-branded-navigation :global(button){min-height:44px;padding:.6rem 1.1rem;border-radius:.65rem;font-size:.875rem;font-weight:600;color:var(--crm-on-sidebar-muted)}
  .crm-branded-navigation :global(button[aria-pressed=true]){background:var(--crm-brand-surface);color:var(--crm-brand-link);box-shadow:inset 0 -3px var(--crm-brand-secondary)}
  @media(max-width:600px){.crm-branded-header{align-items:flex-start;flex-wrap:wrap}.crm-branded-body :global(input:not([type=checkbox]):not([type=radio]):not([type=file])),.crm-branded-body :global(select),.crm-branded-body :global(textarea){font-size:1rem}}
</style>
