import { act, fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ createEventSeries: vi.fn() }));
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: api }));
vi.mock('../../src/lib/authStore', async () => ({ tenantIdStore: (await import('svelte/store')).writable('tenant-a') }));
import { tenantIdStore } from '../../src/lib/authStore';
import Import from '../../src/components/crm/events/EventCsvImport.svelte';
const teams = [{ id: 'team-a', name: 'Varsity' }];
async function upload(lines: string) {
  const source = 'title,date,start_time,end_time,team\n' + lines;
  const file = new File([source], 'events.csv', { type: 'text/csv' });Object.defineProperty(file,'text',{value:async()=>source});
  await fireEvent.change(screen.getByLabelText('Choose CSV'),{target:{files:[file]}});
}
beforeEach(()=>{api.createEventSeries.mockReset();tenantIdStore.set('tenant-a');});
describe('guided CSV import',()=>{
 it('shows requirements, previews rejected rows, and prevents invalid imports',async()=>{
  render(Import as unknown as Component,{teams});expect(screen.getByText('Required columns')).toBeVisible();
  await upload('Bad date,no-date,17:00,18:00,team-a\n');
  expect(await screen.findByText('0 valid · 1 rejected · 0 created')).toBeVisible();expect(screen.getByRole('button',{name:'Import 0 drafts'})).toBeDisabled();expect(api.createEventSeries).not.toHaveBeenCalled();
 });
 it('retries only failed rows with the original idempotency key',async()=>{
  api.createEventSeries.mockResolvedValueOnce({id:'a'}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({id:'b'});
  render(Import as unknown as Component,{teams});await upload('First,2030-08-20,17:00,18:00,team-a\nSecond,2030-08-21,17:00,18:00,team-a\n');
  expect(api.createEventSeries).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Import 2 drafts'}));
  const retry=await screen.findByRole('button',{name:'Retry 1 failed row'});const key=api.createEventSeries.mock.calls[1][3];
  await fireEvent.click(retry);expect(api.createEventSeries).toHaveBeenCalledTimes(3);expect(api.createEventSeries.mock.calls[2][3]).toBe(key);expect(screen.getByRole('status')).toHaveTextContent('2 drafts created.');
 });
 it('stops remaining writes after an organization switch',async()=>{
  let resolve!: (v:unknown)=>void;const pending=new Promise(r=>resolve=r);api.createEventSeries.mockReturnValue(pending);const close=vi.fn();
  render(Import as unknown as Component,{teams,onClose:close});await upload('First,2030-08-20,17:00,18:00,team-a\nSecond,2030-08-21,17:00,18:00,team-a\n');await fireEvent.click(screen.getByRole('button',{name:'Import 2 drafts'}));
  await act(async()=>{tenantIdStore.set('tenant-b');resolve({id:'a'});await pending;});expect(api.createEventSeries).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalled();
 });
});
