import { writable, get } from 'svelte/store';
export const tenantIdStore = writable('event-ui-fixture');
export const activeTenantRole = writable('owner');
export const userStore = writable({ uid: 'fixture-owner' });
export const teamsStore = writable([{ id: 'varsity', name: 'Varsity', status: 'active', ageGroup: '16U' }]);
export const seasonsStore = writable([{ id: 'fall', name: 'Fall 2026 Varsity Package', teamId: 'varsity', status: 'active' }]);
export const eventsStore = writable<any[]>([
  { id: 'sample-practice', title: 'Skills practice', date: '2030-08-20T17:00:00', endDate: '2030-08-20T18:00:00', teamId: 'varsity', location: 'Court A', type: 'Practice', lifecycleStatus: 'draft' },
  { id: 'sample-game', title: 'Summer game', date: '2030-08-21T18:00:00', endDate: '2030-08-21T19:00:00', teamId: 'varsity', location: 'Court B', type: 'Game', lifecycleStatus: 'draft' },
]);
export const registrationsStore = writable([]);
const scope = { loading: false, error: '', truncated: false, limit: 500 };
export const eventsProjectionScope = writable(scope), teamsProjectionScope = writable(scope), registrationsProjectionScope = writable(scope);
export const refreshOperationalCollections = () => {};
export const transactionsStore = writable([]), invoicesStore = writable([]), refundsStore = writable([]);
export const DataStore = { getEventRegistrationCount: () => 0,
  getRegistrationFormFinancials: () => ({totalsAvailable:true,totalCollected:0,totalBalance:0,financialRecordCount:0,currency:'USD',scopeReason:'No financial activity.'}),
  getUserFinancialsForEvents: () => ({paymentStatus:'Unavailable'})
};
export const savedPayload = writable<any>(null);
export const formsStore = writable<any[]>([
  { id: 'event-form', title: 'Standard player form', status: 'active', rawStatus: 'active', sections: [{ id: 'player_information', title: 'Player', fields: [{ id: 'player_name', label: 'Player name', type: 'text', required: true, placeholder: null, options: null, isActive: true }, { id: 'age_group', label: 'Age group', type: 'dropdown', required: true, placeholder: null, options: ['12U','14U','16U'], isActive: true }], isActive: true, description: '' }] },
  { id: 'closed-form', title: 'Archived form', status: 'archived', rawStatus: 'archived' }
]);
export const RegistrationService = {
  subscribeToForms: (_tenant: string, callback: (forms: any[]) => void) => formsStore.subscribe(rows => callback(rows.map(row => ({...row,name:row.title,rawStatus:row.rawStatus || row.status,status:['active','open'].includes(row.rawStatus || row.status)?'Open':['archived','closed'].includes(row.rawStatus || row.status)?'Closed':'Status unavailable'})))),
  fetchRegistrationDetailPage: async (_tenant:string, formId:string) => ({ events:{records:get(eventsStore).filter(event=>event.registrationMethod !== 'easy' && event.registrationFormId===formId),truncated:false},participants:{records:[],truncated:false,exactCount:0} })
};
let nextEventSeries = 0;
// Mutations stay in browser memory; this fixture cannot connect to cloud data.
export const backendClient = {
  async createRegistrationForm(_tenant: string, data: any) { const id = 'local-form-' + Date.now(); formsStore.update(rows => [...rows, { ...data, id, rawStatus: data.status }]); return { id }; },
  async updateRegistrationForm(_tenant: string, id: string, data: any) { formsStore.update(rows => rows.map(row => row.id === id ? { ...row, ...data, rawStatus: data.status } : row)); return { id }; },
  async uploadImageAsset() { return { reservationId: "fixture-cover" }; },
  async publishImageAsset() { return { success: true }; },
  async createEventSeries(_tenant: string, data: any) {
    savedPayload.set(data);
    const series = `fixture-series-${++nextEventSeries}`;
    const records = data.occurrences.map((slot: any, i: number) => ({ ...data, id: `${series}-${i}`, eventSeriesId: series, occurrenceCount: data.occurrences.length, isMultiDateSeries: data.occurrences.length > 1, title: slot.title || data.title, location: slot.location ?? data.location, date: slot.startAt, endDate: slot.endAt, dateKey: slot.dateKey, lifecycleStatus: 'draft', currency: 'USD', isDeleted: false }));
    eventsStore.update(rows => [...rows, ...records]); return { id: series, eventIds: records.map((record: any) => record.id) };
  },
  async updateEvent(_tenant: string, id: string, patch: any) { eventsStore.update((rows) => { const source = rows.find(row => row.id === id); return rows.map((row) => row.id === id || (patch.applyToSeries && row.eventSeriesId === source?.eventSeriesId) ? { ...row, ...patch } : row); }); return { id, eventIds: [id], updatedCount: 1 }; },
};
