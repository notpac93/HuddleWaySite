<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  export let selectedDateKeys: string[] = [];
  const today = new Date();
  let month = new Date(today.getFullYear(), today.getMonth(), 1);
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  $: label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $: first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  $: days = Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setDate(first.getDate() + index); return { date, key: key(date), current: date.getMonth() === month.getMonth() }; });
  function move(offset: number) { month = new Date(month.getFullYear(), month.getMonth() + offset, 1); }
  function toggle(date: string) { selectedDateKeys = (selectedDateKeys.includes(date) ? selectedDateKeys.filter((value) => value !== date) : [...selectedDateKeys, date]).sort(); }
</script>
<div class="schedule-calendar">
  <header><button type="button" class="schedule-icon" aria-label="Previous month" on:click={() => move(-1)}><Icon name="chevronRight" size={20} className="schedule-back-icon" /></button><strong>{label}</strong><button type="button" class="schedule-icon" aria-label="Next month" on:click={() => move(1)}><Icon name="chevronRight" size={20} /></button></header>
  <div class="schedule-calendar-grid" role="group" aria-label="Choose dates">
    {#each ['S','M','T','W','T','F','S'] as name}<span aria-hidden="true">{name}</span>{/each}
    {#each days as day}<button type="button" class:outside={!day.current} aria-label={day.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} aria-pressed={selectedDateKeys.includes(day.key)} disabled={!selectedDateKeys.includes(day.key) && selectedDateKeys.length >= 200} on:click={() => toggle(day.key)}>{day.date.getDate()}</button>{/each}
  </div>
  <div class="schedule-date-count" aria-live="polite">{selectedDateKeys.length} selected</div>
</div>
