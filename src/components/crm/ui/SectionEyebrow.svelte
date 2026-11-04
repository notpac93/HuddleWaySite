<script lang="ts">
  import { getContext } from 'svelte';
  import { readable } from 'svelte/store';
  import { SECTION_NAVIGATION, type SectionNavigation } from '../../../lib/crm/sectionNavigation';

  export let label = '';
  const navigation = getContext<SectionNavigation | undefined>(SECTION_NAVIGATION);
  const available = navigation?.available ?? readable(false);
</script>

{#if $available}
  <button type="button" class="section-eyebrow" aria-label="Back to More" on:click={() => navigation?.openMore()}><span aria-hidden="true">←</span> More</button>
{:else if label}
  <p class="section-eyebrow">{label}</p>
{/if}

<style>
  .section-eyebrow{display:flex;align-items:center;gap:.4rem;margin:0;color:var(--crm-brand-secondary);font-family:inherit;font-size:.65rem;font-weight:700;line-height:1.5;letter-spacing:.14em;text-transform:uppercase}
  button.section-eyebrow{position:relative;padding:0;border:0;background:transparent;cursor:pointer}
  /* Keep the compact label while providing a full touch target. */
  button.section-eyebrow::after{content:'';position:absolute;inset:-14px -8px}
  button.section-eyebrow:hover{text-decoration:underline;text-underline-offset:4px}
  button.section-eyebrow:focus-visible{outline:2px solid currentColor;outline-offset:5px;border-radius:2px}
</style>
