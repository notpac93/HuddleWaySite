import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const backendMocks = vi.hoisted(() => ({ createRegistrationForm: vi.fn(), updateRegistrationForm: vi.fn() }));
vi.mock('../../src/lib/authStore', async () => ({ tenantIdStore: (await import('svelte/store')).writable('tenant-a') }));
vi.mock('../../src/lib/services/DataStore', async () => ({ teamsStore: (await import('svelte/store')).writable([{ id:'team-a', tenantId:'tenant-a', ageGroup:'16U' }]) }));
vi.mock('../../src/lib/services/RegistrationService', () => ({ RegistrationService: { subscribeToForms: (_tenant: string, next: (v: unknown[]) => void) => { next([{ sections: [{ fields: [{ id:'age_group', options:['12U','14U'] }] }] }]); return () => {}; } } }));
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: backendMocks }));
import { tenantIdStore } from '../../src/lib/authStore';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import Form from '../../src/components/crm/registration/CreateRegistrationForm.svelte';
const TestedForm = Form as unknown as Component;
function deferred<T>() { let resolve!: (v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {resolve,promise}; }
async function preview() {
 await fireEvent.click(screen.getByRole('button',{name:'Customize'}));
 while(screen.queryByRole('button',{name:/Next:/})) await fireEvent.click(screen.getByRole('button',{name:/Next:/}));
 await fireEvent.click(screen.getByRole('button',{name:'Preview'}));
}
async function setup(){render(TestedForm);await fireEvent.input(screen.getByLabelText('Form name'),{target:{value:'  Fall registration  '}});}
const panel=()=>screen.getByRole('dialog',{name:/settings$/});
describe('guided registration designer',()=>{
 beforeEach(()=>{vi.resetAllMocks();tenantIdStore.set('tenant-a');vi.spyOn(console,'error').mockImplementation(()=>{});});afterEach(()=>vi.restoreAllMocks());
 it('previews one consumer section at a time and locks one normalized save in flight',async()=>{
  const pending=deferred<{id:string}>();backendMocks.createRegistrationForm.mockReturnValue(pending.promise);await setup();await preview();
  const consumer=screen.getByRole('region',{name:'Consumer registration form preview'});
  expect(within(consumer).getByRole('region',{name:'Player'})).toBeVisible();expect(within(consumer).queryByRole('region',{name:'Guardian'})).toBeNull();
  await fireEvent.click(within(consumer).getByRole('button',{name:'Contact'}));expect(within(consumer).getByRole('region',{name:'Guardian'})).toBeVisible();
  await fireEvent.click(within(consumer).getByRole('button',{name:'Participant'}));
  expect(within(consumer).getByLabelText('Gender')).toHaveDisplayValue('Select');
  await fireEvent.click(screen.getByRole('button',{name:'Save form'}));
  expect(backendMocks.createRegistrationForm).toHaveBeenCalledTimes(1);expect(backendMocks.createRegistrationForm.mock.calls[0][1]).toMatchObject({title:'Fall registration',status:'active'});
  expect(screen.getByRole('button',{name:'Saving…'})).toBeDisabled();expect(screen.getByRole('button',{name:'Back'})).toBeDisabled();
  pending.resolve({id:'new-form'});expect(await screen.findByRole('button',{name:'Saved'})).toBeDisabled();
 });
 it('offers tenant age history and saves the choices shown in preview',async()=>{
  backendMocks.createRegistrationForm.mockResolvedValue({id:'new-form'});await setup();await fireEvent.click(screen.getByRole('button',{name:/^Player/}));
  let p=panel();await fireEvent.click(within(p).getByLabelText('Age group'));await fireEvent.click(within(p).getByRole('button',{name:'Configure Age group'}));
  p=panel();expect(within(p).getByRole('button',{name:'16U'})).toBeVisible();await fireEvent.click(within(p).getByRole('button',{name:'16U'}));
  await fireEvent.click(within(p).getByRole('button',{name:'Done'}));await fireEvent.click(within(panel()).getByRole('button',{name:'Done'}));await preview();
  expect(screen.getByLabelText('Age group').querySelectorAll('option')).toHaveLength(3);await fireEvent.click(screen.getByRole('button',{name:'Save form'}));
  expect(backendMocks.createRegistrationForm.mock.calls[0][1].sections[0].fields.find((f:any)=>f.id==='age_group').options).toEqual(['12U','14U']);
 });
 it('adds multiple custom questions and repeats guardian fields',async()=>{
  backendMocks.createRegistrationForm.mockResolvedValue({id:'new-form'});await setup();await fireEvent.click(screen.getByRole('button',{name:/^Guardian/}));await fireEvent.click(within(panel()).getByRole('button',{name:'More contacts'}));
  for(const name of ['Language','Relationship']){await fireEvent.click(within(panel()).getByRole('button',{name:'+ Add'}));await fireEvent.input(within(panel()).getByLabelText('Question'),{target:{value:name}});await fireEvent.click(within(panel()).getByRole('button',{name:'Done'}));}
  await fireEvent.click(within(panel()).getByRole('button',{name:'Done'}));await preview();await fireEvent.click(within(screen.getByRole('navigation',{name:'Consumer registration sections'})).getByRole('button',{name:'Contact'}));expect(screen.getByLabelText('Guardian 2 · Language')).toBeVisible();expect(screen.getByLabelText('Guardian 2 · Relationship')).toBeVisible();
 });
 it('keeps retry keys stable and rotates after a change',async()=>{
  backendMocks.createRegistrationForm.mockRejectedValue(new BackendApiError({message:'raw database details',status:503,code:'save_failed',requestId:'secret-id'}));await setup();await preview();await fireEvent.click(screen.getByRole('button',{name:'Save form'}));expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');expect(screen.queryByText('raw database details')).toBeNull();
  const key=backendMocks.createRegistrationForm.mock.calls[0][3];await fireEvent.click(screen.getByRole('button',{name:'Retry save'}));await waitFor(()=>expect(backendMocks.createRegistrationForm).toHaveBeenCalledTimes(2));expect(backendMocks.createRegistrationForm.mock.calls[1][3]).toBe(key);
  await fireEvent.click(screen.getByRole('button',{name:'Back'}));await fireEvent.click(screen.getByRole('button',{name:'Change Name'}));await fireEvent.input(within(panel()).getByLabelText('Question'),{target:{value:'Guardian full name'}});await fireEvent.click(within(panel()).getByRole('button',{name:'Done'}));await fireEvent.click(screen.getByRole('button',{name:'Preview'}));await fireEvent.click(screen.getByRole('button',{name:'Save form'}));expect(backendMocks.createRegistrationForm.mock.calls[2][3]).not.toBe(key);
 });
 it('invalidates stale organization responses',async()=>{
  const pending=deferred<{id:string}>();backendMocks.createRegistrationForm.mockReturnValue(pending.promise);await setup();await preview();await fireEvent.click(screen.getByRole('button',{name:'Save form'}));await act(async()=>{tenantIdStore.set('tenant-b');pending.resolve({id:'stale'});await pending.promise;});expect(await screen.findByRole('alert')).toHaveTextContent('organization or form details changed');expect(screen.queryByRole('button',{name:'Saved'})).toBeNull();
 });
 it('preserves archived status and blocks unsupported status',async()=>{
  backendMocks.updateRegistrationForm.mockResolvedValue({id:'closed'});const view=render(TestedForm,{form:{id:'closed',title:'Retired',rawStatus:'archived',fields:{}}});await preview();await fireEvent.click(screen.getByRole('button',{name:'Save form'}));expect(backendMocks.updateRegistrationForm.mock.calls[0][2].status).toBe('archived');view.unmount();render(TestedForm,{form:{id:'unknown',title:'Unknown',rawStatus:'migrating'}});await preview();expect(screen.getByRole('button',{name:'Save form'})).toBeDisabled();
 });
 it('lets users choose answer types and toggle Required without a More control', async () => {
  await setup();await fireEvent.click(screen.getByRole('button',{name:'Customize'}));
  await fireEvent.click(screen.getByRole('button',{name:'Change Date of birth'}));
  let p=panel();expect(within(p).queryByText('More')).toBeNull();
  const required=within(p).getByLabelText('Required');expect(required).toBeEnabled();
  await fireEvent.click(required);expect(required).not.toBeChecked();
  const type=within(p).getByLabelText('Answer type');expect(type).toBeEnabled();
  await fireEvent.change(type,{target:{value:'text'}});await fireEvent.click(within(p).getByRole('button',{name:'Done'}));
  await fireEvent.click(screen.getByRole('button',{name:'Change Date of birth'}));p=panel();
  expect(within(p).getByLabelText('Required')).not.toBeChecked();expect(within(p).getByLabelText('Answer type')).toHaveValue('text');
 });
 it('explains the player identity requirement rather than silently changing settings',async()=>{
  await setup();await fireEvent.click(screen.getByRole('button',{name:'Customize'}));await fireEvent.click(screen.getByRole('button',{name:'Change Player name'}));
  const p=panel();expect(within(p).getByLabelText('Answer type')).toBeEnabled();await fireEvent.click(within(p).getByLabelText('Required'));await fireEvent.click(within(p).getByRole('button',{name:'Done'}));
  expect(within(p).getByRole('alert')).toHaveTextContent('Player name must be a required text field');
 });
 it('groups choices into consumer sections and renders the consumer progress strip',async()=>{
  await setup();expect(screen.getByRole('region',{name:'Participant questions'})).toBeVisible();expect(screen.getByRole('region',{name:'Contacts'})).toBeVisible();expect(screen.getByRole('region',{name:'Details'})).toBeVisible();
  await preview();const consumer=screen.getByRole('region',{name:'Consumer registration form preview'});expect(within(consumer).getByRole('heading',{name:'Registration'})).toBeVisible();
  const navigation=within(consumer).getByRole('navigation',{name:'Consumer registration sections'});expect(within(navigation).getByRole('button',{name:'Participant'})).toBeVisible();expect(within(navigation).getByRole('button',{name:'Contact'})).toBeVisible();
  await fireEvent.click(within(navigation).getByRole('button',{name:'Review'}));expect(within(navigation).getByRole('button',{name:'Review'})).toHaveAttribute('aria-current','step');
 });
 it('cycles through preview steps and keeps answers when returning',async()=>{
  await setup();await preview();const consumer=screen.getByRole('region',{name:'Consumer registration form preview'});
  await fireEvent.input(within(consumer).getByLabelText('Player name'),{target:{value:'Sample Player'}});
  await fireEvent.click(within(consumer).getByRole('button',{name:'Continue'}));
  expect(within(consumer).queryByRole('region',{name:'Player'})).toBeNull();expect(within(consumer).getByRole('region',{name:'Guardian'})).toBeVisible();
  await fireEvent.click(within(consumer).getByRole('button',{name:'Previous step'}));expect(within(consumer).getByLabelText('Player name')).toHaveValue('Sample Player');
  await fireEvent.click(within(consumer).getByRole('button',{name:'Review'}));expect(within(consumer).getByRole('region',{name:'Registration review'})).toHaveTextContent('Sample Player');
  expect(within(consumer).queryByRole('region',{name:'Player'})).toBeNull();
 });
});
