import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/authStore',async()=>({tenantIdStore:(await import('svelte/store')).writable('tenant-a')}));
vi.mock('../../src/lib/services/DataStore',async()=>({teamsStore:(await import('svelte/store')).writable([])}));
vi.mock('../../src/lib/services/RegistrationService',()=>({RegistrationService:{subscribeToForms:(_tenant:string,next:(v:any[])=>void)=>{next([{id:'a',title:'Summer form',rawStatus:'active',fields:{}},{id:'b',title:'Winter form',rawStatus:'archived',fields:{}}]);return()=>{};}}}));
vi.mock('../../src/lib/api/backendClient',()=>({backendClient:{}}));
import Library from '../../src/components/crm/registration/SavedFormLibrary.svelte';
describe('saved form library',()=>{
 it('finds saved forms in a dedicated searchable library and reopens them',async()=>{
  render(Library as unknown as Component,{onClose:vi.fn()});expect(screen.getByRole('dialog',{name:'Saved registration forms'})).toBeVisible();
  await fireEvent.input(screen.getByLabelText('Search saved forms'),{target:{value:'Winter'}});expect(screen.queryByRole('button',{name:/Summer form/})).toBeNull();
  await fireEvent.click(screen.getByRole('button',{name:/Winter form/}));expect(screen.getByRole('dialog',{name:'Edit registration form'})).toBeVisible();expect(screen.getByLabelText('Form name')).toHaveValue('Winter form');
 });
});
