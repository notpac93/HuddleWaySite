<script lang="ts">
  import {
    PORTAL_ICON_PATHS,
    type PortalIconName,
  } from '../../../lib/ui/portalIcons';

  export let name: PortalIconName;
  export let size: 16 | 20 | 24 | 32 | 48 = 24;
  export let label = '';
  export let strokeWidth = 1.5;
  export let className = '';

  $: paths = PORTAL_ICON_PATHS[name] || [];
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={label ? undefined : 'true'}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  focusable="false"
>
  {#each paths as path}
    <path d={path} />
  {/each}
</svg>
