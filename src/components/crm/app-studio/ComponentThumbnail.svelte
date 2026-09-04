<script lang="ts">
  import type { CrmPageComponent } from '../../../lib/api/BackendApi';

  export let component: CrmPageComponent;

  function text(key: string, fallback = '') {
    const value = component.content[key];
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  function rows(key: string) {
    const value = component.content[key];
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  }
</script>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-gray-50" aria-label={`${component.label} content snapshot`}>
  {#if component.type === 'hero_section'}
    <div class="crm-theme-selected flex min-h-24 flex-col justify-end p-3">
      <p class="text-[9px] font-bold uppercase tracking-widest opacity-70">{text('badgeText', 'Hero')}</p>
      <p class="mt-1 line-clamp-2 text-sm font-bold leading-tight text-gray-950">{text('headline', component.label)}</p>
      <p class="mt-1 truncate text-[10px] text-gray-600">{text('subheadline', 'Supporting message')}</p>
    </div>
  {:else if component.type === 'events_section'}
    <div class="p-3">
      <p class="text-[9px] font-bold uppercase tracking-wider text-gray-500">Upcoming event</p>
      <div class="mt-2 flex gap-2 rounded-md bg-white p-2 shadow-sm">
        <div class="crm-theme-selected h-10 w-10 shrink-0 rounded"></div>
        <div class="min-w-0"><p class="truncate text-xs font-semibold">{text('displayTitle', text('title', component.label))}</p><p class="mt-1 text-[10px] text-gray-500">Next event · Details from Events</p></div>
      </div>
    </div>
  {:else if component.type === 'about_section'}
    <div class="grid min-h-24 grid-cols-[3fr_2fr] gap-2 p-3">
      <div class="min-w-0"><p class="truncate text-xs font-semibold">{text('title', component.label)}</p><p class="mt-1 line-clamp-3 text-[10px] leading-relaxed text-gray-500">{text('intro', text('body', 'Program story and supporting information.'))}</p></div>
      <div class="crm-theme-selected rounded-md"></div>
    </div>
  {:else if component.type === 'coach_grid' || component.type === 'head_coach_section'}
    <div class="p-3">
      <p class="truncate text-xs font-semibold">{text('title', component.label)}</p>
      <div class="mt-2 flex gap-2">
        {#each (rows('profiles').length ? rows('profiles').slice(0, 3) : [{}, {}, {}]) as profile}
          <div class="min-w-0 flex-1 rounded-md bg-white p-2 text-center shadow-sm"><div class="crm-theme-selected mx-auto h-6 w-6 rounded-full"></div><p class="mt-1 truncate text-[9px]">{String(profile.name || 'Staff')}</p></div>
        {/each}
      </div>
    </div>
  {:else if component.type === 'contact_section'}
    <div class="p-3"><p class="text-xs font-semibold">{component.label}</p><p class="mt-2 truncate text-[10px] text-gray-600">{text('email', 'Email')}</p><p class="mt-1 truncate text-[10px] text-gray-600">{text('phone', 'Phone')}</p></div>
  {:else if component.type === 'schedule_section'}
    <div class="p-3"><p class="truncate text-xs font-semibold">{text('title', component.label)}</p><div class="mt-2 space-y-1">{#each [1, 2] as row}<div class="flex items-center gap-2 rounded bg-white px-2 py-1 shadow-sm"><span class="crm-theme-selected h-5 w-5 rounded"></span><span class="h-1.5 flex-1 rounded bg-gray-200"></span></div>{/each}</div></div>
  {:else if component.type === 'messaging_feed'}
    <div class="p-3"><p class="truncate text-xs font-semibold">{text('title', component.label)}</p><div class="mt-2 rounded-md bg-white p-2 shadow-sm"><p class="text-[10px] font-medium">Latest update</p><div class="mt-2 h-1.5 w-4/5 rounded bg-gray-200"></div><div class="mt-1 h-1.5 w-3/5 rounded bg-gray-200"></div></div></div>
  {:else if component.type === 'info_blocks' || component.type === 'info_carousel'}
    <div class="p-3"><p class="truncate text-xs font-semibold">{text('title', text('sectionTitle', component.label))}</p><div class="mt-2 grid grid-cols-2 gap-2">{#each [1, 2] as card}<div class="rounded-md bg-white p-2 shadow-sm"><div class="crm-theme-selected h-7 rounded"></div><div class="mt-2 h-1.5 w-4/5 rounded bg-gray-200"></div></div>{/each}</div></div>
  {:else}
    <div class="flex min-h-24 items-center justify-center p-3 text-center text-xs font-semibold text-gray-700">{component.label}</div>
  {/if}
</div>
