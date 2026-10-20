import { act, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const roster = vi.hoisted(() => ({ subscribeToPlayers: vi.fn() }));
vi.mock('../../src/lib/firebase', () => ({ auth: {}, db: {}, storage: {} }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'), availableTenants: writable(['tenant-a']),
    tenantNamesStore: writable({ 'tenant-a': 'Alpha Club' }),
  };
});
vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    seasonsStore: writable([]), teamsStore: writable([]),
    teamsProjectionScope: writable({ loading: false, error: '', truncated: false }),
  };
});
vi.mock('../../src/lib/services/RosterService', () => ({ RosterService: roster }));
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: {
  crmTenantBranding: vi.fn(async () => ({ exists: true, branding: { name: 'Alpha Club' } })),
} }));

import CrmTeamScopeHarness from '../fixtures/CrmTeamScopeHarness.svelte';
import { tenantIdStore } from '../../src/lib/authStore';
import { portalDraftStore, registerPortalDraft } from '../../src/lib/ui/portalDraftGuard';

const complete = { truncated: { registrations: false, memberships: false, teams: false }, requestId: 'scope-read' };
let subscriptions: Array<{ success: (...args: any[]) => void; unsubscribe: ReturnType<typeof vi.fn> }>;
const scope = () => screen.getByRole('group', { name: 'Current team scope' });

describe('small-screen team scope recovery', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    tenantIdStore.set('tenant-a');
    portalDraftStore.set(null);
    subscriptions = [];
    roster.subscribeToPlayers.mockReset();
    roster.subscribeToPlayers.mockImplementation((_tenant, _team, success) => {
      const unsubscribe = vi.fn();
      subscriptions.push({ success, unsubscribe });
      return unsubscribe;
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); portalDraftStore.set(null); });

  it('clears the selected team and reloads the organization roster without changing tenant', async () => {
    render(CrmTeamScopeHarness as unknown as Component);
    expect(scope()).toHaveTextContent('Team: Esports');
    expect(roster.subscribeToPlayers).toHaveBeenLastCalledWith('tenant-a', { id: 'esports', name: 'Esports' }, expect.any(Function), expect.any(Function));
    await act(() => subscriptions[0].success([], complete));
    await fireEvent.click(within(scope()).getByRole('button', { name: 'All teams' }));
    expect(screen.queryByRole('group', { name: 'Current team scope' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Organization teams' })).toBeVisible();
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    await fireEvent.click(within(screen.getByRole('navigation', { name: 'Admin quick access' })).getByRole('button', { name: /More/ }));
    await fireEvent.click(within(screen.getByRole('region', { name: 'More' })).getByRole('button', { name: 'Roster' }));
    expect(roster.subscribeToPlayers).toHaveBeenLastCalledWith('tenant-a', null, expect.any(Function), expect.any(Function));
    await act(() => {
      subscriptions[0].success([{ id: 'old', name: 'Stale team row', role: 'Player', status: 'Active' }], complete);
      subscriptions[1].success([{ id: 'org', name: 'Organization participant', role: 'Player', status: 'Active' }], complete);
    });
    expect(screen.getAllByText('Organization participant')[0]).toBeVisible();
    expect(screen.queryByText('Stale team row')).toBeNull();
    expect(get(tenantIdStore)).toBe('tenant-a');
  });

  it('keeps scope and roster intact until the existing draft guard permits leaving', async () => {
    render(CrmTeamScopeHarness as unknown as Component);
    const discard = vi.fn();
    registerPortalDraft({ id: 'roster-draft', title: 'Roster draft', message: 'Unsaved roster work', onDiscard: discard });
    await fireEvent.click(within(scope()).getByRole('button', { name: 'All teams' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Unsaved roster work');
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(scope()).toHaveTextContent('Esports');
    expect(subscriptions[0].unsubscribe).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    await fireEvent.click(within(scope()).getByRole('button', { name: 'All teams' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard & leave' }));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Current team scope' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Organization teams' })).toBeVisible();
    expect(get(tenantIdStore)).toBe('tenant-a');
  });
});
