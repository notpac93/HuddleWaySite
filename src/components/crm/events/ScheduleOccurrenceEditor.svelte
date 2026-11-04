<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  export let dates: string[] = [];
  export let slots: Array<{ startTime: string; endTime: string }> = [];
  export let title = '';
  export let location = '';
  export let overrides: Record<string, { title?: string; location?: string; startTime?: string; endTime?: string }> = {};
  let page = 0;
  let editing = '';
  $: entries = dates.flatMap(date => slots.map((slot, index) => ({ date, slot, key: `${date}:${index}` })));
  $: page = Math.min(page, Math.max(0, Math.ceil(entries.length / 3) - 1));
  const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = (value: string) => value ? new Date(`2026-01-01T${value}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Choose time';
  function update(key: string, field: string, value: string) { overrides = { ...overrides, [key]: { ...overrides[key], [field]: value } }; }
</script>
<section class="schedule-occurrences" aria-label="Scheduled dates">
  <header><strong>{entries.length} scheduled {entries.length === 1 ? 'session' : 'sessions'}</strong><span>Each date is editable</span></header>
  {#each entries.slice(page * 3, page * 3 + 3) as entry (entry.key)}
    {@const edit = overrides[entry.key] || {}}
    <div class="schedule-occurrence">
      <div><strong>{day(entry.date)}</strong><span>{edit.title || title} · {time(edit.startTime ?? entry.slot.startTime)}–{time(edit.endTime ?? entry.slot.endTime)}</span></div>
      <button type="button" class="schedule-icon" aria-label={`Edit ${day(entry.date)} ${entry.slot.startTime} only`} aria-expanded={editing === entry.key} on:click={() => editing = editing === entry.key ? '' : entry.key}><Icon name="pencil" size={20} /></button>
    </div>
    {#if editing === entry.key}<div class="schedule-occurrence-fields"><span class="schedule-small-label">This date only</span><label class="schedule-field">Name<input aria-label="Name for this date" value={edit.title ?? title} maxlength="200" on:input={(event) => update(entry.key, 'title', event.currentTarget.value)} /></label><div class="schedule-field-pair"><label class="schedule-field">Start<input type="time" aria-label="Start time for this date" value={edit.startTime ?? entry.slot.startTime} on:input={(event) => update(entry.key, 'startTime', event.currentTarget.value)} /></label><label class="schedule-field">End<input type="time" aria-label="End time for this date" value={edit.endTime ?? entry.slot.endTime} on:input={(event) => update(entry.key, 'endTime', event.currentTarget.value)} /></label></div><label class="schedule-field">Location<input aria-label="Location for this date" value={edit.location ?? location} maxlength="500" on:input={(event) => update(entry.key, 'location', event.currentTarget.value)} /></label><button type="button" class="schedule-text-button" on:click={() => editing = ''}>Done</button></div>{/if}
  {/each}
  {#if entries.length > 3}<footer><span>{page * 3 + 1}–{Math.min(page * 3 + 3, entries.length)} of {entries.length}</span><button type="button" class="schedule-icon" aria-label="Previous dates" disabled={page === 0} on:click={() => { page--; editing = ''; }}><Icon name="chevronRight" size={20} className="schedule-back-icon" /></button><button type="button" class="schedule-icon" aria-label="Next dates" disabled={(page + 1) * 3 >= entries.length} on:click={() => { page++; editing = ''; }}><Icon name="chevronRight" size={20} /></button></footer>{/if}
</section>
