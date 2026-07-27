<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import DataTable from '../DataTable.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import { registrationDisplayRecord } from '../../../lib/ui/registrationDisplay';

  export let event = null;
  export let registrations = [];
  export let onClose = () => {};
  export let incomplete = false;

  const dispatch = createEventDispatcher();

  $: eventRegistrants = registrations.filter((registration) =>
    registration.eventId === event?.id
  ).map((registration) =>
    registrationDisplayRecord(String(registration.id || ''), registration)
  );

</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">
    <button type="button" class="crm-ui-backdrop" aria-label="Close event registrants" tabindex="-1" on:click={onClose}></button>

    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-y-auto shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full max-h-[calc(100vh-2rem)]" tabindex="-1" use:modalFocus={{ onEscape: onClose }}>
      <div class="crm-ui-modal-body">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl leading-6 font-bold text-gray-900" id="modal-title">
              Event Registrants
            </h3>
            <p class="mt-1 text-sm text-gray-500">
              {event?.title || 'Event'} • {incomplete ? 'Count unavailable' : `${eventRegistrants.length} registered`}
            </p>
          </div>
          <button type="button" on:click={onClose} class="text-gray-400 hover:text-gray-500">
            <span class="sr-only">Close</span>
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p class="mb-4 text-sm text-gray-500">
          Roster moves and participant messaging are managed through their audited workflows.
        </p>
        {#if incomplete}
          <p class="crm-ui-notice" role="status">
            The registration projection is truncated. This loaded list is not a complete event roster.
          </p>
        {/if}

        <div class="h-[500px] overflow-y-auto">
          <DataTable
            data={eventRegistrants.map((registration) => ({
              ...registration,
              name: registration.participantName || 'Participant name unavailable',
            }))}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'teamName', label: 'Team' },
              { key: 'status', label: 'Status' }
            ]}
            exportFilename="event_registrants"
            searchPlaceholder="Search registrants..."
            selectable={false}
          />
        </div>

      </div>
    </div>
  </div>
</div>
