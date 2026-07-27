<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    eventsProjectionScope,
    eventsStore,
    registrationsProjectionScope,
    registrationsStore,
    teamsProjectionScope,
    teamsStore,
  } from '../../lib/services/DataStore';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import { registrationDisplayRecord } from '../../lib/ui/registrationDisplay';

  export let isOpen = false;

  let searchQuery = '';
  let searchInput: HTMLInputElement;
  const dispatch = createEventDispatcher();

  $: if (isOpen && searchInput) {
    setTimeout(() => searchInput?.focus(), 50);
  }

  function closeSearch() {
    isOpen = false;
    searchQuery = '';
    dispatch('close');
  }

  function openResult(tab: 'Roster' | 'Teams' | 'Events', id: string) {
    if (!id) return;
    dispatch('navigate', { tab, id });
    closeSearch();
  }

  $: query = searchQuery.toLowerCase().trim();

  $: searchablePlayers = $registrationsStore.map((registration) =>
    registrationDisplayRecord(String(registration.id || ''), registration)
  ).filter((registration) => Boolean(registration.id));
  $: filteredPlayers = query ? searchablePlayers.filter((registration) =>
    (registration.participantName || '').toLocaleLowerCase().includes(query)
    || (registration.email || '').toLocaleLowerCase().includes(query)
  ).slice(0, 5) : [];

  $: filteredTeams = query ? $teamsStore.filter(t => {
    return String(t.id || '').trim() && (
      String(t.name || '').toLocaleLowerCase().includes(query)
      || String(t.division || '').toLocaleLowerCase().includes(query)
    );
  }).slice(0, 5) : [];

  $: filteredEvents = query ? $eventsStore.filter(e => {
    return String(e.id || '').trim() && (
      String(e.title || '').toLocaleLowerCase().includes(query)
      || String(e.type || '').toLocaleLowerCase().includes(query)
    );
  }).slice(0, 5) : [];

  $: hasResults = query && (filteredPlayers.length > 0 || filteredTeams.length > 0 || filteredEvents.length > 0);
  $: searchIsLoading =
    $registrationsProjectionScope.loading
    || $teamsProjectionScope.loading
    || $eventsProjectionScope.loading;
  $: searchErrors = [
    $registrationsProjectionScope.error,
    $teamsProjectionScope.error,
    $eventsProjectionScope.error,
  ].filter(Boolean);
  $: searchIsTruncated =
    $registrationsProjectionScope.truncated
    || $teamsProjectionScope.truncated
    || $eventsProjectionScope.truncated;

</script>

{#if isOpen}
  <div class="crm-ui-modal-root" aria-labelledby="global-search-title" role="dialog" aria-modal="true">
    <div class="flex items-start justify-center min-h-screen pt-16 px-4 pb-20 text-center sm:block sm:p-0">

      <!-- Background overlay -->
      <button type="button" class="crm-ui-backdrop" aria-label="Close global search" tabindex="-1" on:click={closeSearch}></button>

      <div class="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-top sm:max-w-2xl sm:w-full" tabindex="-1" use:modalFocus={{ onEscape: closeSearch, initialFocusSelector: '#global-search-input' }}>
        <div class="bg-white">
          <h2 id="global-search-title" class="sr-only">Search HuddleWay records</h2>
          <div class="relative border-b border-gray-200">
            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
              </svg>
            </div>
            <input
              bind:this={searchInput}
              bind:value={searchQuery}
              id="global-search-input"
              type="search"
              aria-label="Search players, teams, or events"
              class="w-full pl-11 pr-4 py-4 border-0 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 sm:text-lg"
              placeholder="Search players, teams, or events..."
            >
            <div class="absolute inset-y-0 right-0 pr-4 flex items-center">
              <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded border border-gray-200">ESC</span>
            </div>
          </div>

          <div class="max-h-[60vh] overflow-y-auto">
            <div class="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
              Search covers the loaded organization projections (up to {$registrationsProjectionScope.limit} records per category).
              {#if searchIsTruncated} More records exist, so results are incomplete.{/if}
            </div>
            {#if searchIsLoading}
              <div class="p-8 text-center text-sm text-gray-500" role="status">Loading searchable records…</div>
            {:else if searchErrors.length > 0}
              <div class="p-8 text-center text-sm text-red-700" role="alert">
                Some searchable records could not be loaded. Results are unavailable until all categories load successfully.
              </div>
            {:else if query.length === 0}
              <div class="p-4 text-sm text-gray-500">
                Search by participant name or email, team name, or event title.
              </div>
            {:else if !hasResults}
              <div class="p-8 text-center">
                <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-gray-500">No results found for "{searchQuery}"</p>
              </div>
            {:else}
              <div class="py-2">
                {#if filteredPlayers.length > 0}
                  <div class="px-4 py-2">
                    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Players / Registrations</h3>
                    <ul class="space-y-1">
                      {#each filteredPlayers as player (player.id)}
                        <li>
                          <button type="button" class="flex w-full items-center justify-between p-2 hover:bg-blue-50 rounded-md cursor-pointer group text-left" on:click={() => openResult('Roster', player.id)}>
                          <div class="crm-ui-center">
                            <div class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-[#1a56db] font-bold mr-3">
                              {((player.participantName || '?').charAt(0)).toUpperCase()}
                            </div>
                            <div>
                              <p class="text-sm font-medium text-gray-900 group-hover:text-[#1a56db]">{player.participantName || 'Participant name unavailable'}</p>
                              <p class="crm-ui-hint-xs">{player.email || 'Email unavailable'}</p>
                            </div>
                          </div>
                          <span class="text-xs text-gray-400">Player</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if filteredTeams.length > 0}
                  {#if filteredPlayers.length > 0}<div class="border-t border-gray-100 my-2"></div>{/if}
                  <div class="px-4 py-2">
                    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Teams</h3>
                    <ul class="space-y-1">
                      {#each filteredTeams as team (team.id)}
                        <li>
                          <button type="button" class="flex w-full items-center justify-between p-2 hover:bg-blue-50 rounded-md cursor-pointer group text-left" on:click={() => openResult('Teams', team.id)}>
                          <div class="crm-ui-center">
                            <div class="h-8 w-8 rounded-md bg-gray-100 flex items-center justify-center text-gray-500 mr-3">
                              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                            </div>
                            <div>
                              <p class="text-sm font-medium text-gray-900 group-hover:text-[#1a56db]">{team.name}</p>
                              <p class="crm-ui-hint-xs">{team.description || 'Team details unavailable'}</p>
                            </div>
                          </div>
                          <span class="text-xs text-gray-400">Team</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if filteredEvents.length > 0}
                  {#if filteredPlayers.length > 0 || filteredTeams.length > 0}<div class="border-t border-gray-100 my-2"></div>{/if}
                  <div class="px-4 py-2">
                    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Events & Forms</h3>
                    <ul class="space-y-1">
                      {#each filteredEvents as event (event.id)}
                        <li>
                          <button type="button" class="flex w-full items-center justify-between p-2 hover:bg-blue-50 rounded-md cursor-pointer group text-left" on:click={() => openResult('Events', event.id)}>
                          <div class="crm-ui-center">
                            <div class="h-8 w-8 rounded-md bg-purple-100 flex items-center justify-center text-purple-600 mr-3">
                              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                            </div>
                            <div>
                              <p class="text-sm font-medium text-gray-900 group-hover:text-[#1a56db]">{event.title}</p>
                              <p class="crm-ui-hint-xs">{event.type || 'Event type unavailable'}</p>
                            </div>
                          </div>
                          <span class="text-xs text-gray-400">Event</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
