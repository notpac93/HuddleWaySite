<script>
  import MyAppStudio from '../../../src/components/crm/MyAppStudio.svelte';
  const realApp = Boolean(import.meta.env.VITE_REAL_CONSUMER_PREVIEW_URL);
</script>
<div class="crm-ui-shell-root local-layout-fixture">
  <p class="fixture-label">{realApp ? 'LOCAL APP PREVIEW · Real family app · Sample content · Changes stay local' : 'LOCAL TEST FIXTURE · In-memory changes · Schematic preview'}</p>
  <MyAppStudio />
</div>
<style>
  :global(html), :global(body), :global(#app) { margin: 0; height: 100%; }
  .local-layout-fixture { display: flex; position: relative; height: 100dvh; background: #eef2f7; }
  .fixture-label { position: fixed; top: 4px; left: 8px; z-index: 50; max-width: 60%; font: 10px/1.4 sans-serif; color: #607087; pointer-events: none; }
  @media (max-width: 800px) { .fixture-label { display: none; } }
</style>
