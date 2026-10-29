<script lang="ts">
  import { recurringEventDates } from '../../../lib/ui/eventRecurrence';
  export let selectedDateKeys: string[] = [];
  const today = new Date();
  const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  export let startDate = localKey(today);
  export let endDate = '';
  export let pattern = 'weekly';
  export let days: number[] = [today.getDay()];
  export let skipped: string[] = [];
  let previousStartDate = startDate;
  $: if (startDate !== previousStartDate) {
    const previousDay = new Date(`${previousStartDate}T12:00:00`).getDay();
    const nextDay = new Date(`${startDate}T12:00:00`).getDay();
    if (days.length === 1 && days[0] === previousDay && Number.isInteger(nextDay)) days = [nextDay];
    previousStartDate = startDate;
  }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  $: generated = recurringEventDates(startDate, endDate, days, pattern === 'bi-weekly');
  $: selectedDateKeys = generated.filter((date) => !skipped.includes(date));
  function label(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
</script>
<div class="space-y-4 text-left">
  <div class="grid gap-3 sm:grid-cols-2">
    <label class="crm-ui-label">Start date<input type="date" class="crm-ui-input mt-2" bind:value={startDate} /></label>
    <label class="crm-ui-label">End date<input type="date" min={startDate} class="crm-ui-input mt-2" bind:value={endDate} /></label>
  </div>
  <label class="crm-ui-label block">Repeats<select class="crm-ui-input mt-2" bind:value={pattern}><option value="weekly">Every week</option><option value="bi-weekly">Every other week</option></select></label>
  <fieldset><legend class="crm-ui-label mb-2">On these days</legend><div class="grid grid-cols-7 gap-1">
    {#each dayNames as name, index}<button type="button" aria-label={name} aria-pressed={days.includes(index)} class="min-h-11 rounded-md border px-1 py-3 text-xs {days.includes(index) ? 'border-[var(--crm-brand-control)] bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)]' : 'border-gray-200 bg-white text-gray-600'}" on:click={() => days = days.includes(index) ? days.filter((day) => day !== index) : [...days, index]}>{name.slice(0, 3)}</button>{/each}
  </div></fieldset>
  {#if endDate && endDate < startDate}<p class="text-sm text-red-700" role="alert">End date must be on or after the start date.</p>
  {:else if generated.length > 200}<p class="text-sm text-red-700" role="alert">Choose a shorter schedule. Up to 200 sessions can be scheduled.</p>
  {:else if selectedDateKeys.length}<p class="text-sm font-medium text-gray-700" aria-live="polite">Repeating event · {label(selectedDateKeys[0])}–{label(selectedDateKeys[selectedDateKeys.length - 1])}</p>{/if}
  <details><summary class="cursor-pointer text-sm text-[var(--crm-brand-link)]">Review dates <span class="text-gray-500">{selectedDateKeys.length} selected</span></summary><div class="mt-3 grid gap-2 sm:grid-cols-2">{#each generated as date}<label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={!skipped.includes(date)} on:change={(event) => skipped = event.currentTarget.checked ? skipped.filter((key) => key !== date) : [...skipped, date]} />{label(date)}</label>{/each}</div></details>
</div>
