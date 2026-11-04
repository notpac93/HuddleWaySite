<script>
  import CommunicationsManager from '../../../src/components/crm/CommunicationsManager.svelte';
  const phone = new URLSearchParams(location.search).get('phone') === 'true';
</script>
<div class="crm-theme-default-host" class:phone>
  <header class="fixture-header"><strong>HuddleWay Program</strong><span>Local preview · Sample data</span></header>
  <main><CommunicationsManager /></main>
</div>
<style>
  :global(body){margin:0;font-family:Roboto,Arial,sans-serif;background:#e9edf2}
  .fixture-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px;background:white;color:#003366;font-size:15px}
  .fixture-header span{font-size:11px;color:#66758a}main{height:calc(100dvh - 62px);min-height:700px}
  .phone{max-width:390px;margin:auto}.phone main{height:auto;min-height:850px}
</style>
