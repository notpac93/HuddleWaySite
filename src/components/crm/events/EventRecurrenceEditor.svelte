<script lang="ts">
  import { scheduledEventDates, type ScheduleCadence } from '../../../lib/ui/eventRecurrence';
  export let selectedDateKeys: string[] = [];
  export let startDate = '';
  export let endDate = '';
  export let pattern = 'weekly';
  export let days: number[] = [];
  export let skipped: string[] = [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  $: generated = scheduledEventDates(startDate, endDate, days, pattern as ScheduleCadence);
  $: selectedDateKeys = generated.filter(date => !skipped.includes(date));
  function label(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
</script>
<div class="schedule-repeat-fields">
  <label class="schedule-field">Repeat<select bind:value={pattern}><option value="daily">Daily</option><option value="weekly">Every week</option><option value="bi-weekly">Every 2 weeks</option><option value="monthly">Monthly on the same date</option></select></label>
  {#if pattern === 'weekly' || pattern === 'bi-weekly'}
    <fieldset class="schedule-weekdays"><legend>On</legend><div>{#each dayNames as name, index}<button type="button" aria-label={name} aria-pressed={days.includes(index)} on:click={() => days = days.includes(index) ? days.filter(day => day !== index) : [...days, index]}>{name.slice(0,3)}</button>{/each}</div></fieldset>
  {/if}
  <div class="schedule-field-pair"><label class="schedule-field">Starts<input type="date" aria-label="Start date" bind:value={startDate} /></label><label class="schedule-field">Until<input type="date" aria-label="End date" min={startDate} bind:value={endDate} /></label></div>
  {#if endDate && endDate < startDate}<p class="schedule-error" role="alert">End date must be on or after the start date.</p>
  {:else if generated.length > 200}<p class="schedule-error" role="alert">Choose a shorter schedule. Up to 200 dates can be scheduled.</p>
  {:else if selectedDateKeys.length}<div class="schedule-repeat-summary" aria-live="polite">{selectedDateKeys.length} dates · {label(selectedDateKeys[0])}–{label(selectedDateKeys[selectedDateKeys.length-1])}</div>{/if}
  {#if generated.length && generated.length <= 200}<details class="schedule-extra"><summary>Review dates <span>{selectedDateKeys.length} selected</span></summary><div class="schedule-review-dates">{#each generated as date}<label><input type="checkbox" checked={!skipped.includes(date)} on:change={(event) => skipped = event.currentTarget.checked ? skipped.filter(key => key !== date) : [...skipped, date]} />{label(date)}</label>{/each}</div></details>{/if}
</div>
