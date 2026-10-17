import { writable } from 'svelte/store';
const tenantId='fixture-yoga';
export const tenantIdStore=writable(tenantId);
export const activeTenantRole=writable('owner');
export const userStore=writable({ uid:'fixture-owner',email:'owner@example.test' });
export const seasonsStore=writable([]);
export const teamsStore=writable([{id:'class-1',name:'Foundations of yoga and mindful movement',status:'active'}]);
export const eventsStore=writable([{id:'event-1', title:'Restorative yoga and breathwork for complete beginners', date:'2031-10-20T17:00:00Z', lifecycleStatus:'published', teamId:'class-1', type:'Class', registrationCount:12, registrationCountComplete:true, location:'Willow Studio · Main room', imageUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}]);
export const registrationsStore=writable([]);
export const transactionsStore=writable([]), invoicesStore=writable([]), refundsStore=writable([]);
const scope={loading:false,error:'',truncated:false,limit:100};
export const eventsProjectionScope=writable(scope),teamsProjectionScope=writable(scope),registrationsProjectionScope=writable(scope);
export const refreshOperationalCollections=async()=>{};
export const DataStore={getEventRegistrationCount:()=>12};
const players=[{id:'member-1',name:'Alexandra Montgomery-Williams',email:'alexandra.montgomery.williams@example.test',role:'Member',team:'Foundations of yoga and mindful movement',teamId:'class-1',status:'Active'},{id:'member-2',name:'Priya Ramanathan',email:'priya@example.test',role:'Member',team:'',teamId:'',status:'Active'}];
const row=(key: string,label: string,amountCents: number,status='paid')=>({key,kind:'transaction',label,amountCents,status,statusLabel:status==='paid'?'Paid':'Pending',currency:'USD',date:'2026-10-16',dateLabel:'Oct 16, 2026',context:'Unlimited monthly membership',detail:'October membership · Visa ending in 4242'});
const reads: Record<string, (...args: any[]) => Promise<any>>={
 financialOverview:async()=>({operations:{complete:true,reconciliation:{complete:true},views:{deposits:[row('d1','Weekly deposit',128400)],transactions:[row('t1',players[0].name,12900),row('t2','Jordan Chen',18000),row('t3',players[1].name,8500,'pending')],invoices:[],scheduled:[],overdue:[]}}}),
 adminStaffDirectory:async()=>({tenantId,staff:[{membershipId:'staff-1',uid:'staff-1',role:'editor',status:'active',active:true,displayName:'Alexandra Montgomery-Williams',email:'alexandra.montgomery.williams@example.test',emailVerified:true,joinedAt:'2026-10-01T12:00:00Z'}],pendingInvites:[],truncated:{staff:false,pendingInvites:false}}),
 documents:async()=>({tenantId,documents:[{id:'document-1',title:'New member handbook and studio policies',fileType:'pdf',category:'Handbook',availabilityScope:'organization',isAvailable:true,hasApprovedStoragePath:true,canDelete:false,deleteUnavailableReason:'Read-only fixture',storageSizeBytes:1200000,uploadedAt:'2026-10-15T12:00:00Z'}],truncated:false}),
 rosterPlayersPage:async(_tenant: string,teamId?: string)=>({tenantId,teamId:teamId||'',players,truncated:{registrations:false,memberships:false,teams:false}}),
};
export const backendClient=new Proxy(reads,{get(target,key){if(typeof key === 'string' && key in target)return target[key];return async()=>{throw new Error(`Read-only fixture: ${String(key)} is disabled`);};}});
