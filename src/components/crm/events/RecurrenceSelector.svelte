<script lang="ts">
  import { seasonsStore } from '../../../lib/services/DataStore';

  export let selectedDateKeys: string[] = [];

  // Calendar State
  let calendarMonth = new Date();
  calendarMonth.setDate(1);

  type CalendarDay = {
    date: Date;
    key: string;
    dayNumber: number;
    inCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
  };

  function formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function buildCalendarDays(month: Date, selectedDates: string[]): CalendarDay[] {
    const today = new Date();
    const todayKey = formatDateKey(today);

    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const startOffset = firstDay.getDay();

    const days: CalendarDay[] = [];
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - startOffset);

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const key = formatDateKey(date);

      days.push({
        date,
        key,
        dayNumber: date.getDate(),
        inCurrentMonth: date.getMonth() === month.getMonth(),
        isToday: key === todayKey,
        isSelected: selectedDates.includes(key),
      });
    }
    return days;
  }

  $: calendarDays = buildCalendarDays(calendarMonth, selectedDateKeys);
  $: calendarMonthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(calendarMonth);

  function changeCalendarMonth(offset: number) {
    calendarMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + offset,
      1,
    );
  }

  function selectCalendarDay(day: CalendarDay) {
    if (selectedDateKeys.includes(day.key)) {
      selectedDateKeys = selectedDateKeys.filter((dateKey) => dateKey !== day.key);
    } else {
      selectedDateKeys = [...selectedDateKeys, day.key].sort();
    }

    if (!day.inCurrentMonth) {
      calendarMonth = new Date(day.date.getFullYear(), day.date.getMonth(), 1);
    }
  }

  function calendarDayClass(day: CalendarDay) {
    if (day.isSelected) {
      return 'bg-[#00a4bd] text-white font-semibold shadow-sm';
    }
    if (!day.inCurrentMonth) {
      return 'text-gray-300 hover:bg-gray-50';
    }
    return 'text-gray-700 hover:bg-cyan-50 hover:text-[#007f91]';
  }

  function readableDate(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(year, month - 1, day));
  }

  function parseLocalCalendarDate(value: unknown): Date | null {
    const firestoreDate = (value as { toDate?: () => unknown })?.toDate?.();
    if (firestoreDate instanceof Date) {
      return Number.isNaN(firestoreDate.getTime())
        ? null
        : new Date(firestoreDate);
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value);
    }
    if (typeof value === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
      if (match) {
        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        const day = Number(match[3]);
        const localDate = new Date(year, monthIndex, day);
        return localDate.getFullYear() === year
          && localDate.getMonth() === monthIndex
          && localDate.getDate() === day
          ? localDate
          : null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  function calendarDayDifference(start: Date, end: Date) {
    const startOrdinal = Date.UTC(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );
    const endOrdinal = Date.UTC(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
    );
    return Math.floor((endOrdinal - startOrdinal) / 86_400_000);
  }

  // Recurrence Builder State
  let recurrenceMode = 'weekly'; // 'weekly', 'bi-weekly', 'season'
  let recurrenceDays: Record<number, boolean> = { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false }; // Sun-Sat
  let recurrenceEndDate = '';
  let selectedSeasonId = '';

  let showCalendar = false;

  let ruleError = '';
  function generateRecurrentDates() {
    if (recurrenceMode === 'custom') return;

    let start = new Date();
    let end = new Date();

    if (recurrenceMode === 'season') {
       if (!selectedSeasonId) {
         ruleError = 'Please select a season.';
         return;
       }
       const season = $seasonsStore.find(s => s.id === selectedSeasonId);
       if (season) {
         const seasonStart = parseLocalCalendarDate(season.startDate);
         const seasonEnd = parseLocalCalendarDate(season.endDate);
         if (!seasonStart || !seasonEnd) {
           ruleError = 'Selected season has invalid start or end dates.';
           return;
         }
         start = seasonStart;
         end = seasonEnd;
       } else {
         ruleError = 'Selected season not found.';
         return;
       }
    } else if (recurrenceMode === 'weekly' || recurrenceMode === 'bi-weekly') {
       if (!recurrenceEndDate) {
         ruleError = 'Please select an end date.';
         return;
       }
       const parsedEnd = parseLocalCalendarDate(recurrenceEndDate);
       if (!parsedEnd) {
         ruleError = 'Please select a valid end date.';
         return;
       }
       end = parsedEnd;
    } else return;

    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const targetDays = Object.keys(recurrenceDays).filter(d => recurrenceDays[Number(d)]).map(Number);
    if (targetDays.length === 0) {
      ruleError = 'Please select at least one day of the week.';
      return;
    }

    if (start > end) {
      ruleError = 'End date must be after start date.';
      return;
    }

    ruleError = '';
    let newDates: string[] = [];
    let current = new Date(start);

    let currentWeekStart = new Date(current);
    currentWeekStart.setDate(current.getDate() - current.getDay());

    while (current <= end) {
      const weekIndex = Math.floor(
        calendarDayDifference(currentWeekStart, current) / 7,
      );
      const includeWeek =
        recurrenceMode !== 'bi-weekly' || weekIndex % 2 === 0;

      if (includeWeek && targetDays.includes(current.getDay())) {
         newDates.push(formatDateKey(current));
      }
      current.setDate(current.getDate() + 1);
    }

    selectedDateKeys = Array.from(new Set([...selectedDateKeys, ...newDates])).sort();

    if (newDates.length > 0) {
       const firstDateParts = newDates[0].split('-');
       calendarMonth = new Date(Number(firstDateParts[0]), Number(firstDateParts[1]) - 1, 1);
    }
  }

  function clearDates() {
    selectedDateKeys = [];
    ruleError = '';
  }
</script>

<div class="space-y-4">
  {#if !showCalendar}
    <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h4 class="text-sm font-semibold text-gray-900 mb-3">Recurrence Rule</h4>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="recurrence-pattern" class="block text-xs font-semibold text-gray-700 mb-1">Pattern</label>
          <select id="recurrence-pattern" bind:value={recurrenceMode} class="crm-ui-input-search">
            <option value="weekly">Weekly</option>
            <option value="bi-weekly">Bi-Weekly</option>
            <option value="season">Linked to Season</option>
          </select>
        </div>

        {#if recurrenceMode === 'season'}
          <div>
            <label for="recurrence-season" class="block text-xs font-semibold text-gray-700 mb-1">Select Season</label>
            <select id="recurrence-season" bind:value={selectedSeasonId} class="crm-ui-input-search">
              <option value="">-- Choose Season --</option>
              {#each $seasonsStore as season}
                <option value={season.id}>{season.name || season.title || 'Unnamed Season'}</option>
              {/each}
            </select>
          </div>
        {:else if recurrenceMode === 'weekly' || recurrenceMode === 'bi-weekly'}
          <div>
            <label for="recurrence-end-date" class="block text-xs font-semibold text-gray-700 mb-1">End Date</label>
            <input id="recurrence-end-date" type="date" bind:value={recurrenceEndDate} class="crm-ui-input-search" />
          </div>
        {/if}
      </div>

      <div class="mt-3">
        <p class="block text-xs font-semibold text-gray-700 mb-2">Days of the week</p>
        <div class="flex flex-wrap gap-2">
          {#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day, i}
            <label class="flex items-center cursor-pointer" title={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}>
              <input type="checkbox" bind:checked={recurrenceDays[i]} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]} class="sr-only" />
              <span class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold {recurrenceDays[i] ? 'bg-[#00a4bd] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition-colors">
                {day}
              </span>
            </label>
          {/each}
        </div>
      </div>
      {#if ruleError}
        <div class="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded-md">
          {ruleError}
        </div>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" on:click={clearDates} class="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md">Clear Selected</button>
        <button type="button" on:click={generateRecurrentDates} class="px-3 py-1.5 text-xs font-medium text-white bg-[#00a4bd] hover:bg-[#007f91] rounded-md">Apply Rule</button>
      </div>

      <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span class="crm-ui-hint-xs">Need to manually add or remove dates?</span>
        <button type="button" on:click={() => showCalendar = true} class="text-[#00a4bd] hover:text-[#007f91] text-xs font-semibold">Select specific days</button>
      </div>
    </div>
  {:else}
    <div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
      <button type="button" on:click={() => changeCalendarMonth(-1)} class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800" aria-label="Previous month">
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <p class="text-sm font-semibold text-gray-900">{calendarMonthLabel}</p>
      <button type="button" on:click={() => changeCalendarMonth(1)} class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800" aria-label="Next month">
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div class="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400" aria-hidden="true">
      <span class="py-1">Sun</span>
      <span class="py-1">Mon</span>
      <span class="py-1">Tue</span>
      <span class="py-1">Wed</span>
      <span class="py-1">Thu</span>
      <span class="py-1">Fri</span>
      <span class="py-1">Sat</span>
    </div>

    <div class="mt-1 grid grid-cols-7 gap-y-1">
      {#each calendarDays as day (day.key)}
        <button
          type="button"
          on:click={() => selectCalendarDay(day)}
          class="relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors {calendarDayClass(day)} {day.isToday && !day.isSelected ? 'ring-1 ring-inset ring-[#00a4bd]' : ''}"
          aria-label={readableDate(day.key)}
          aria-pressed={day.isSelected}
        >
          {day.dayNumber}
        </button>
      {/each}
    </div>

    <div class="mt-4 border-t border-gray-100 pt-3 flex justify-between items-center">
      <button type="button" on:click={() => showCalendar = false} class="text-xs font-semibold text-gray-500 hover:text-gray-700">Back to Rules</button>
      <button type="button" on:click={() => showCalendar = false} class="px-3 py-1.5 bg-[#00a4bd] text-white text-xs font-semibold rounded-md hover:bg-[#007f91]">Done selecting</button>
    </div>
  </div>
  {/if}

  <div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
    <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected dates ({selectedDateKeys.length})</p>
    {#if selectedDateKeys.length > 0}
      <div class="mt-2 flex flex-wrap gap-2">
        {#each selectedDateKeys as dateKey (dateKey)}
            <button
              type="button"
              on:click={() => selectedDateKeys = selectedDateKeys.filter((selectedDate) => selectedDate !== dateKey)}
              class="crm-ui-event-date-pill"
              aria-label={`Remove ${readableDate(dateKey)}`}
            >
              {readableDate(dateKey)}
              <span aria-hidden="true" class="text-cyan-700">×</span>
            </button>
          {/each}
      </div>
    {:else}
      <p class="mt-1 text-xs text-red-600">Select at least one date.</p>
    {/if}
  </div>
</div>
