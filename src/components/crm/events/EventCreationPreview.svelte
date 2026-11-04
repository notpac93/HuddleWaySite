<script lang="ts">
  export let title = '';
  export let type = '';
  export let team = '';
  export let dates: string[] = [];
  export let slots: Array<{ startTime: string; endTime: string }> = [];
  export let location = '';
  export let notes = '';
  export let imageUrl = '';
  export let seasonName = '';
  export let price = 0;
  export let installments = 1;
  export let cadence = 'monthly';
  export let registration = false;
  export let registrationMethod = 'form';
  function day(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }); }
  function time(value: string) { return new Date(`2026-01-01T${value}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
</script>
<article class="overflow-hidden rounded-xl border border-gray-200 bg-white text-left" aria-label="Published event preview">
  {#if imageUrl}<img src={imageUrl} alt={`${title} cover`} width="640" height="360" class="aspect-video w-full object-cover" />{:else}<div class="flex aspect-video items-center justify-center bg-[var(--crm-brand-sidebar)] text-[var(--crm-on-sidebar)]"><span class="text-sm">{team}</span></div>{/if}
  <div class="space-y-4 p-5">
    <div class="flex items-center gap-2 text-xs">{#if type && type !== 'Other'}<span class="rounded bg-[var(--crm-brand-surface)] px-2 py-1 text-[var(--crm-brand-link)]">{type}</span>{/if}<span class="text-gray-500">{team}</span></div>
    <h4 class="text-2xl font-semibold text-gray-950">{title}</h4>
    <p class="text-sm text-gray-700">{dates[0] ? day(dates[0]) : ''}{dates.length > 1 ? ` – ${day(dates[dates.length - 1])}` : ''}</p>
    <p class="text-sm text-gray-700">{slots.map((slot) => `${time(slot.startTime)}–${time(slot.endTime)}`).join(' · ')}</p>
    {#if location}<p class="text-sm text-gray-700">{location}</p>{/if}
    {#if dates.length > 1}<details><summary class="cursor-pointer text-sm text-[var(--crm-brand-link)]">View scheduled dates</summary><ul class="mt-2 space-y-2 text-sm text-gray-600">{#each dates as date}<li>{day(date)}</li>{/each}</ul></details>{/if}
    {#if notes}<div><h5 class="font-medium">About this event</h5><p class="mt-2 whitespace-pre-wrap text-sm text-gray-600">{notes}</p></div>{/if}
    {#if seasonName}<div class="rounded-lg bg-[var(--crm-brand-surface)] p-3 text-sm text-[var(--crm-on-brand-surface)]"><strong>Included with {seasonName}</strong><p class="mt-2 text-xs">For covered season participants only. No additional payment.</p></div>{/if}
    <div class="border-t border-gray-200 pt-4"><strong>{seasonName ? 'Included with your season' : price > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price) : 'No charge'}</strong>{#if !seasonName && price > 0 && installments > 1}<p class="mt-1 text-xs text-gray-500">Pay in full or split into {installments} {cadence} payments.</p>{/if}<button type="button" disabled class="mt-4 w-full rounded-lg bg-[var(--crm-brand-sidebar)] px-4 py-3 font-semibold text-[var(--crm-on-sidebar)]">{seasonName ? 'View season event' : registration ? (registrationMethod === 'easy' ? 'Easy registration' : 'Register') : 'View event'}</button></div>
  </div>
</article>
