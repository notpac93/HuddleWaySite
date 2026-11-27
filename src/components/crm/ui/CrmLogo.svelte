<script module lang="ts">
  export const CRM_LOGO = Symbol('CRM logo');
  export const CRM_DEFAULT_LOGO = '/logo.webp';
</script>

<script lang="ts">
  import { getContext } from 'svelte';
  import { readable, type Readable } from 'svelte/store';
  import { publicEnvironment, resolveBackendUrl } from '../../../lib/config/publicEnvironment';

  export let alt = '';
  const logo = getContext<Readable<string | null> | undefined>(CRM_LOGO) ?? readable(CRM_DEFAULT_LOGO);

  $: crossOrigin = $logo?.startsWith(`${resolveBackendUrl(publicEnvironment)}/`) ? 'anonymous' : undefined;

  function fallback(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    if (image.getAttribute('src') === CRM_DEFAULT_LOGO) return;
    image.removeAttribute('crossorigin');
    image.src = CRM_DEFAULT_LOGO;
  }
</script>

{#key $logo}
  <img {...$$restProps} {alt} crossorigin={crossOrigin} src={$logo ?? undefined} style:visibility={$logo ? undefined : 'hidden'} on:error={fallback} />
{/key}
