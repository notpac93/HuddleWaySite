import { writable } from 'svelte/store';
export const tenantIdStore = writable('event-ui-fixture');
export const activeTenantRole = writable('owner');
export const userStore = writable({ uid: 'fixture-owner' });
export const teamsStore = writable([{ id: 'varsity', name: 'Varsity', status: 'active' }]);
export const seasonsStore = writable([{ id: 'fall', name: 'Fall 2026 Varsity Package', teamId: 'varsity', status: 'active' }]);
export const eventsStore = writable<any[]>([]);
export const registrationsStore = writable([]);
const scope = { loading: false, error: '', truncated: false, limit: 500 };
export const eventsProjectionScope = writable(scope), teamsProjectionScope = writable(scope), registrationsProjectionScope = writable(scope);
export const refreshOperationalCollections = () => {};
export const DataStore = { getEventRegistrationCount: () => 0 };
export const savedPayload = writable<any>(null);
export const RegistrationService = { subscribeToForms: (_tenant: string, callback: (forms: any[]) => void) => { callback([{ id: 'event-form', title: 'Event registration' }]); return () => {}; } };
// Mutations stay in browser memory; this fixture cannot connect to cloud data.
export const backendClient = {
  async uploadImageAsset() { return { reservationId: "fixture-cover" }; },
  async publishImageAsset() { return { success: true }; },
  async createEventSeries(_tenant: string, data: any) {
    savedPayload.set(data);
    const records = data.occurrences.map((slot: any, i: number) => ({ ...data, id: `fixture-${i}`, eventSeriesId: 'fixture-series', occurrenceCount: data.occurrences.length, isMultiDateSeries: data.occurrences.length > 1, date: slot.startAt, endDate: slot.endAt, dateKey: slot.dateKey, lifecycleStatus: 'draft', currency: 'USD', isDeleted: false }));
    eventsStore.set(records); return { id: 'fixture-series', eventIds: records.map((record: any) => record.id) };
  },
  async updateEvent(_tenant: string, id: string, patch: any) { eventsStore.update((rows) => rows.map((row) => row.id === id || (patch.applyToSeries && row.eventSeriesId === 'fixture-series') ? { ...row, ...patch } : row)); return { id, eventIds: [id], updatedCount: 1 }; },
};
