<script lang="ts">
  import { getContext } from 'svelte';
  import { readable } from 'svelte/store';
  import { CRM_DEFAULT_LOGO, CRM_WORKSPACE, useDefaultLogo, type CrmWorkspaceContext } from '../../../lib/crm/workspaceContext';
  import { publicEnvironment, resolveBackendUrl } from '../../../lib/config/publicEnvironment';

  let className = '';
  export { className as class };

  const logo = getContext<CrmWorkspaceContext | undefined>(CRM_WORKSPACE)?.logo ?? readable(CRM_DEFAULT_LOGO);
  $: crossOrigin = $logo?.startsWith(`${resolveBackendUrl(publicEnvironment)}/`) ? 'anonymous' : undefined;
</script>

{#key $logo}
  <img class={className} alt="" crossorigin={crossOrigin} src={$logo ?? undefined} style:visibility={$logo ? undefined : 'hidden'} on:error={useDefaultLogo} />
{/key}
